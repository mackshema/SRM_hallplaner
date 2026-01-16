
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useExam } from "@/context/ExamContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { db, Hall, Department } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Shuffle, FileDown, Plus } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HeaderSettings } from "@/lib/exportBenchLayoutWord";

const SeatingPlans = () => {
  const [settings, setSettings] = useState<HeaderSettings>({
    institutionName: "",
    institutionSubtitle: "",
    institutionAffiliation: "",
    examCellName: "",
    academicYear: "",
    examName: ""
  });
  const [halls, setHalls] = useState<Hall[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [generating, setGenerating] = useState(false);
  const [unallocatedStudents, setUnallocatedStudents] = useState<string[]>([]);
  const [showUnallocatedDialog, setShowUnallocatedDialog] = useState(false);
  const [skipRollNumbers, setSkipRollNumbers] = useState<string[]>([]);
  const [skipInput, setSkipInput] = useState("");
  const [manualRollNumbers, setManualRollNumbers] = useState<string[]>([]);
  const [manualRollInput, setManualRollInput] = useState("");
  const [showManualAddDialog, setShowManualAddDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { examDate, setExamDate, examTime, setExamTime, examSession, setExamSession } = useExam();


  useEffect(() => {
    const fetchData = async () => {
      try {
        const hallsData = await db.getAllHalls();
        setHalls(hallsData);

        const deptsData = await db.getAllDepartments();
        setDepartments(deptsData);

        const settingsRes = await fetch("http://localhost:5000/api/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSettings(settingsData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  const handleViewHall = (hallId: string) => {
    navigate(`/admin/seating-plans/${hallId}`);
  };

  const handleSkipRollNumbers = () => {
    if (!skipInput.trim()) return;

    const newSkips = skipInput
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    setSkipRollNumbers((prev) => Array.from(new Set([...prev, ...newSkips])));
    setSkipInput("");

    toast({
      title: "Roll numbers skipped",
      description: `${newSkips.length} roll numbers added to skip list`,
    });
  };

  const handleAddManualRollNumbers = () => {
    if (!manualRollInput.trim()) return;

    const rolls = manualRollInput
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    setManualRollNumbers((prev) => Array.from(new Set([...prev, ...rolls])));
    setManualRollInput("");

    toast({
      title: "Manual roll numbers added",
      description: `${rolls.length} roll numbers added manually`,
    });
  };

  const handleGenerateAllSeatingPlans = async () => {
    setGenerating(true);
    try {
      const result = await db.generateAllSeatingPlans(
        examDate,
        examSession,
        examTime,
        skipRollNumbers,
        manualRollNumbers
      );

      if (result.success) {
        toast({
          title: "Success",
          description: "Seating plans generated successfully.",
        });

        // Reload halls to get updated exam metadata
        const updatedHalls = await db.getAllHalls();
        setHalls(updatedHalls);

        if (result.unallocated && result.unallocated.length > 0) {
          setUnallocatedStudents(result.unallocated);
          setShowUnallocatedDialog(true);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to generate seating plans.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Error while generating seating plans.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };



  const exportConsolidatedPlan = async () => {
    try {
      // Use A4 Landscape
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      const currentDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Get all assignments
      const allAssignments = await db.getAllSeatAssignments();

      if (allAssignments.length === 0) {
        toast({
          title: "No Data",
          description: "No seating assignments found. Generate seating plans first.",
          variant: "destructive",
        });
        return;
      }

      // Check for hall-specific exam details
      const hallIds = Array.from(new Set(allAssignments.map(a => String(a.hallId))));

      let examDateDisplay = "";
      let examSessionDisplay = "";
      let examTimeDisplay = "";

      // Use user input from the UI if available, otherwise fallback to saved hall data
      if (examDate) {
        examDateDisplay = examDate;
        examSessionDisplay = examSession;
        examTimeDisplay = examTime;
      } else {
        // Try to find ANY hall that has exam metadata set
        const firstHallWithDate = halls.find(h => hallIds.includes(String(h._id)) && h.examDate);
        if (firstHallWithDate) {
          examDateDisplay = firstHallWithDate.examDate || "";
          examSessionDisplay = firstHallWithDate.examSession || "";
          examTimeDisplay = firstHallWithDate.examTime || "";
        }
      }

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

      doc.setFontSize(14);
      doc.text(settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", centerX, 22, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(settings.institutionAffiliation || "Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai", centerX, 28, { align: "center" });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(settings.examCellName || "EXAMINATION CELL", centerX, 38, { align: "center" });

      doc.setFontSize(11);
      doc.text(settings.academicYear || "ACADEMIC YEAR 2025-2026 (ODD SEMESTER)", centerX, 45, { align: "center" });
      doc.text(settings.examName || "INTERNAL ASSESSMENT TEST – II (Except I Year)", centerX, 51, { align: "center" });
      doc.text("CONSOLIDATED HALL PLAN", centerX, 57, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      const dateSessionText = `Date / Session : ${examDateDisplay || "_______"} ${examSessionDisplay ? `(${examSessionDisplay})` : ""}`;
      doc.text(dateSessionText, 14, 68);

      if (examTimeDisplay) {
        doc.text(`Exam Time: ${examTimeDisplay}`, centerX, 68, { align: "center" });
      }

      // Group assignments by hall and department
      const hallGroups: { [hallId: string]: { [deptId: string]: string[] } } = {};

      allAssignments.forEach((assignment) => {
        const hallId = String(assignment.hallId);
        const deptId = String(assignment.departmentId || '');

        if (!hallGroups[hallId]) {
          hallGroups[hallId] = {};
        }
        if (!hallGroups[hallId][deptId]) {
          hallGroups[hallId][deptId] = [];
        }
        hallGroups[hallId][deptId].push(assignment.studentRollNumber);
      });

      // Prepare table data
      const tableData: any[] = [];

      Object.keys(hallGroups).forEach((hallId) => {
        const hall = halls.find(h => String(h._id) === hallId);
        const deptGroups = hallGroups[hallId];

        Object.keys(deptGroups).forEach((deptId) => {
          // Find department by ID (handle string/number mismatch)
          const dept = departments.find(d =>
            String(d.id) === deptId ||
            String(d._id) === deptId
          );

          // Numeric sort for roll numbers
          const rollNumbers = deptGroups[deptId].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''));
            const numB = parseInt(b.replace(/\D/g, ''));
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
          });

          if (rollNumbers.length > 0) {
            const fromRoll = rollNumbers[0];
            const toRoll = rollNumbers[rollNumbers.length - 1];
            const count = rollNumbers.length;

            // Determine floor
            let floor = hall?.floor;
            if (!floor && hall) {
              const nameLower = hall.name.toLowerCase();
              if (nameLower.includes("second") || nameLower.includes("2nd")) floor = "SECOND FLOOR";
              else if (nameLower.includes("third") || nameLower.includes("3rd")) floor = "THIRD FLOOR";
              else if (nameLower.includes("first") || nameLower.includes("1st")) floor = "FIRST FLOOR";
              else floor = "GROUND FLOOR";
            } else if (!floor) {
              floor = "GROUND FLOOR";
            }

            tableData.push([
              dept?.name || "Unknown",
              fromRoll,
              toRoll,
              count.toString(),
              hall?.name || hallId,
              floor.toUpperCase()
            ]);
          }
        });
      });

      // Sort table data by Hall No then Department Name
      tableData.sort((a, b) => {
        if (a[4] !== b[4]) return a[4].localeCompare(b[4]);
        return a[0].localeCompare(b[0]);
      });

      // Create table
      autoTable(doc, {
        head: [["Dept.", "Reg. No. From", "Reg. No. To", "No. of Candidates", "Hall No", "Floor"]],
        body: tableData,
        startY: 75,
        theme: "grid",
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          lineWidth: 0.5,
          lineColor: [0, 0, 0]
        },
        bodyStyles: {
          lineWidth: 0.5,
          lineColor: [0, 0, 0]
        },
        styles: {
          fontSize: 9,
          cellPadding: 3
        }
      });

      // Footer
      const finalY = (doc as any).lastAutoTable.finalY || 75;
      doc.setFontSize(10);
      doc.text("Examcell Coordinator", 14, finalY + 15);
      doc.text("Chief Superintendent", pageWidth - 14, finalY + 15, { align: "right" });

      const filenameDate = examDateDisplay ? examDateDisplay.replace(/\//g, '-') : new Date().toISOString().split('T')[0];
      doc.save(`consolidated-hall-plan-${filenameDate}.pdf`);

      toast({
        title: "PDF Exported",
        description: "Consolidated hall plan exported successfully."
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({
        title: "Error",
        description: "Failed to export PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Seating Plans</h1>
          <p className="text-gray-600">View and manage seating plans for all exam halls</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportConsolidatedPlan}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            Export Consolidated Plan
          </Button>
          <Button
            onClick={handleGenerateAllSeatingPlans}
            disabled={generating || halls.length === 0}
            className="gap-2"
          >
            <Shuffle className="h-4 w-4" />
            {generating ? "Generating..." : "Generate Seating Plan"}
          </Button>
        </div>
      </div>
      {/* ✅ GLOBAL EXAM CONFIGURATION */}
      <div className="mb-6 rounded-lg border bg-blue-50 p-4">
        <h3 className="font-semibold mb-3">Exam Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Exam Date</Label>
            <Input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Session</Label>
            <select
              className="w-full border rounded-md p-2"
              value={examSession}
              onChange={(e) =>
                setExamSession(e.target.value as "FN" | "AN")
              }
            >
              <option value="FN">FN</option>
              <option value="AN">AN</option>
            </select>
          </div>

          <div>
            <Label>Exam Time</Label>
            <Input
              value={examTime}
              onChange={(e) => setExamTime(e.target.value)}
              placeholder="09:30 AM"
            />
          </div>
        </div>
      </div>

      {/* ✅ ROLL NUMBER MANAGEMENT */}
      <div className="mb-6 rounded-lg border bg-gray-50 p-4">
        <h3 className="font-semibold mb-3">Roll Number Management</h3>

        <div className="flex gap-4 items-end flex-wrap mb-4">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="skipRollNumbers">Skip Roll Numbers (comma separated)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="skipRollNumbers"
                placeholder="e.g., 911123149005, 911123149012"
                value={skipInput}
                onChange={(e) => setSkipInput(e.target.value)}
              />
              <Button variant="outline" onClick={handleSkipRollNumbers}>
                Add
              </Button>
            </div>
          </div>

          <Button variant="outline" onClick={() => setShowManualAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Manual Roll Numbers
          </Button>
        </div>

        {skipRollNumbers.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Skipped Roll Numbers:</h4>
            <div className="flex flex-wrap gap-2">
              {skipRollNumbers.map((num, index) => (
                <div key={index} className="bg-gray-100 px-2 py-1 rounded-md text-sm flex items-center">
                  {num}
                  <button
                    className="ml-1 text-gray-500 hover:text-red-500"
                    onClick={() => setSkipRollNumbers(skipRollNumbers.filter(n => n !== num))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {manualRollNumbers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Manual Roll Numbers:</h4>
            <div className="flex flex-wrap gap-2">
              {manualRollNumbers.map((num, index) => (
                <div key={index} className="bg-blue-100 px-2 py-1 rounded-md text-sm flex items-center">
                  {num}
                  <button
                    className="ml-1 text-gray-500 hover:text-red-500"
                    onClick={() => setManualRollNumbers(manualRollNumbers.filter(n => n !== num))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hall Name</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {halls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                  No exam halls created yet. Create halls to generate seating plans.
                </TableCell>
              </TableRow>
            ) : (
              halls.map(hall => (
                <TableRow key={hall._id}>
                  <TableCell className="font-medium">{hall.name}</TableCell>
                  <TableCell>
                    {hall.rows} rows × {hall.columns} columns, {hall.seatsPerBench} seats per bench
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHall(hall._id)}
                    >
                      View & Configure
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={showUnallocatedDialog} onOpenChange={setShowUnallocatedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unallocated Roll Numbers</AlertDialogTitle>
            <AlertDialogDescription>
              The following roll numbers couldn't be allocated due to insufficient space:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 overflow-y-auto border rounded-md p-4">
            <div className="text-sm space-y-1">
              {unallocatedStudents.map((rollNumber, index) => (
                <div key={index}>{rollNumber}</div>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Roll Number Addition Dialog */}
      <Dialog open={showManualAddDialog} onOpenChange={setShowManualAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Roll Numbers</DialogTitle>
            <DialogDescription>
              Add roll numbers that are outside the predefined department ranges
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="manualRolls">Roll Numbers (comma separated)</Label>
              <Input
                id="manualRolls"
                placeholder="e.g., 911123149999, 911123150000"
                value={manualRollInput}
                onChange={(e) => setManualRollInput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowManualAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              handleAddManualRollNumbers();
              setShowManualAddDialog(false);
            }}>
              Add Roll Numbers
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SeatingPlans;
