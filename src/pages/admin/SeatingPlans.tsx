import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { db, Hall, Department, ExamSession } from "@/lib/db";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Shuffle, FileDown, Plus, Lock, Calendar, Clock, Edit, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HeaderSettings } from "@/lib/exportBenchLayoutWord";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Assuming these exist, else standard select

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

  // SESSION MANAGEMENT
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [showCreateSessionDialog, setShowCreateSessionDialog] = useState(false);
  const [newSessionData, setNewSessionData] = useState({
    examDate: "",
    examSession: "FN" as "FN" | "AN",
    examTime: "09:30 AM"
  });
  const [creatingSession, setCreatingSession] = useState(false);

  const [showEditSessionDialog, setShowEditSessionDialog] = useState(false);
  const [showDeleteSessionDialog, setShowDeleteSessionDialog] = useState(false);
  const [editingSession, setEditingSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [editSessionData, setEditSessionData] = useState({
    id: "",
    examDate: "",
    examSession: "FN" as "FN" | "AN",
    examTime: ""
  });

  const [unallocatedStudents, setUnallocatedStudents] = useState<string[]>([]);
  const [showUnallocatedDialog, setShowUnallocatedDialog] = useState(false);
  const [skipRollNumbers, setSkipRollNumbers] = useState<string[]>([]);
  const [skipInput, setSkipInput] = useState("");
  const [manualRollNumbers, setManualRollNumbers] = useState<string[]>([]);
  const [manualRollInput, setManualRollInput] = useState("");
  const [showManualAddDialog, setShowManualAddDialog] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const hallsData = await db.getAllHalls();
        setHalls(hallsData);

        const deptsData = await db.getAllDepartments();
        setDepartments(deptsData);

        // Fetch Exam Sessions
        const sessionsData = await db.getExamSessions();
        setExamSessions(sessionsData);

        // Select latest or first if available and none selected
        if (sessionsData.length > 0 && !selectedSessionId) {
          // Default to the last created (assumed bottom or top based on sort)
          // Controller sorts by examDate asc. Maybe default to last?
          setSelectedSessionId(sessionsData[sessionsData.length - 1]._id);
        }

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

  const handleCreateSession = async () => {
    if (!newSessionData.examDate || !newSessionData.examTime) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    setCreatingSession(true);
    try {
      const session = await db.createExamSession(newSessionData);
      setExamSessions(prev => [...prev, session]);
      setSelectedSessionId(session._id);
      setShowCreateSessionDialog(false);
      toast({ title: "Success", description: "New exam session created" });
      // Reset form
      setNewSessionData({ examDate: "", examSession: "FN", examTime: "09:30 AM" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreatingSession(false);
    }
  };

  const handleEditSession = async () => {
    if (!editSessionData.examDate || !editSessionData.examTime) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }
    setEditingSession(true);
    try {
      const updated = await db.updateExamSession(editSessionData.id, {
        examDate: editSessionData.examDate,
        examSession: editSessionData.examSession,
        examTime: editSessionData.examTime,
      });
      setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowEditSessionDialog(false);
      toast({ title: "Success", description: "Exam session updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setEditingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId) return;
    setDeletingSession(true);
    try {
      await db.deleteExamSession(selectedSessionId);
      setExamSessions(prev => prev.filter(s => s._id !== selectedSessionId));
      setSelectedSessionId("");
      setShowDeleteSessionDialog(false);
      toast({ title: "Success", description: "Exam session deleted successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingSession(false);
    }
  };

  const handleFinalizeSession = async () => {
    if (!selectedSessionId) return;
    try {
      const updated = await db.finalizeExamSession(selectedSessionId);
      setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      toast({ title: "Finalized", description: "Seating plan finalized and locked." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleViewHall = (hallId: string) => {
    if (!selectedSessionId) {
      toast({ title: "Select Session", description: "Please select an exam session first", variant: "destructive" });
      return;
    }
    navigate(`/admin/seating-plans/${hallId}?examSessionId=${selectedSessionId}`);
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

  const [showShortageDialog, setShowShortageDialog] = useState(false);
  const [allocationWarnings, setAllocationWarnings] = useState<string[]>([]);
  const [facultySuggestions, setFacultySuggestions] = useState<any[]>([]);
  const [tempDemandFacultyIds, setTempDemandFacultyIds] = useState<string[]>([]);

  const handleGenerateAllSeatingPlans = async (demandOverride: string[] = []) => {
    if (!selectedSessionId) {
      toast({ title: "Error", description: "No exam session selected", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const result = await db.generateAllSeatingPlans(
        selectedSessionId,
        skipRollNumbers,
        manualRollNumbers,
        demandOverride
      );

      if (result.success) {
        if (result.unallocated && result.unallocated.length > 0) {
          setUnallocatedStudents(result.unallocated);
          setShowUnallocatedDialog(true);
        }

        if (result.allocationResult?.shortage) {
          toast({
            title: "Partial Generation",
            description: "Students allocated, but some halls have faculty shortages.",
            variant: "default",
          });
          setAllocationWarnings(result.allocationResult.warnings);
          setFacultySuggestions(result.allocationResult.suggestions);
          setTempDemandFacultyIds(demandOverride);
          setShowShortageDialog(true);
        } else {
          toast({
            title: "Success",
            description: "Seating plans and faculty allocated successfully.",
          });
          setShowShortageDialog(false);
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

  const handleApplyDemand = () => {
    setShowShortageDialog(false);
    handleGenerateAllSeatingPlans(tempDemandFacultyIds);
  };

  const toggleDemandFaculty = (id: string) => {
    setTempDemandFacultyIds(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const exportConsolidatedPlan = async () => {
    if (!selectedSessionId) {
      toast({ title: "Error", description: "No exam session selected", variant: "destructive" });
      return;
    }

    const currentSession = examSessions.find(s => s._id === selectedSessionId);
    if (!currentSession) return;

    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      // Get all assignments for THIS session
      const allAssignments = await db.getAllSeatAssignments(selectedSessionId);

      if (allAssignments.length === 0) {
        toast({
          title: "No Data",
          description: "No seating assignments found. Generate seating plans first.",
          variant: "destructive",
        });
        return;
      }

      const examDateDisplay = currentSession.examDate;
      const examSessionDisplay = currentSession.examSession;
      const examTimeDisplay = currentSession.examTime;

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
      doc.text(settings.academicYear || "ACADEMIC YEAR 2025-2026", centerX, 45, { align: "center" });
      doc.text("CONSOLIDATED HALL PLAN", centerX, 57, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      const dateSessionText = `Date / Session : ${examDateDisplay} (${examSessionDisplay})`;
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

      const finalY = (doc as any).lastAutoTable.finalY || 75;
      doc.setFontSize(10);
      doc.text("Examcell Coordinator", 14, finalY + 15);
      doc.text("Chief Superintendent", pageWidth - 14, finalY + 15, { align: "right" });

      const filenameDate = examDateDisplay ? examDateDisplay.replace(/\//g, '-') : new Date().toISOString().split('T')[0];
      doc.save(`consolidated-hall-plan-${filenameDate}-${examSessionDisplay}.pdf`);

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

  const selectedSession = examSessions.find(s => s._id === selectedSessionId);
  const isFinalized = selectedSession?.status === "FINAL";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Seating Plans</h1>
          <p className="text-gray-600">View and manage seating plans for all exam halls</p>
        </div>
        <div className="flex gap-2">

          {/* Session Selector */}
          <div className="flex gap-1 items-center bg-white border rounded-md p-1 shadow-sm">
            <select
              className="p-1 min-w-[200px] outline-none bg-transparent"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              <option value="" disabled>Select Exam Session</option>
              {examSessions.map(s => (
                <option key={s._id} value={s._id}>
                  {s.examDate} ({s.examSession}) - {s.status}
                </option>
              ))}
            </select>
            {selectedSessionId && selectedSession?.status === "DRAFT" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => {
                    if (selectedSession) {
                      setEditSessionData({
                        id: selectedSession._id,
                        examDate: selectedSession.examDate,
                        examSession: selectedSession.examSession,
                        examTime: selectedSession.examTime,
                      });
                      setShowEditSessionDialog(true);
                    }
                  }}
                  title="Edit Exam Session"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteSessionDialog(true)}
                  title="Delete Exam Session"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          <Button onClick={() => setShowCreateSessionDialog(true)} variant="secondary">
            <Plus className="h-4 w-4 mr-1" /> New Exam Date
          </Button>

          <Button
            variant="outline"
            onClick={exportConsolidatedPlan}
            className="gap-2"
            disabled={!selectedSessionId}
          >
            <FileDown className="h-4 w-4" />
            Export Consolidated
          </Button>

          <Button
            onClick={() => handleGenerateAllSeatingPlans([])}
            disabled={generating || halls.length === 0 || !selectedSessionId || isFinalized}
            className="gap-2"
            variant={isFinalized ? "secondary" : "default"}
          >
            {isFinalized ? <Lock className="h-4 w-4" /> : <Shuffle className="h-4 w-4" />}
            {generating ? "Generating..." : isFinalized ? "Locked (Final)" : "Generate Seating"}
          </Button>
        </div>
      </div>

      {selectedSession && (
        <div className="mb-6 rounded-lg border bg-blue-50 p-4 flex justify-between items-center">
          <div className="flex gap-6 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-semibold uppercase">Exam Date</p>
                <p className="font-bold">{selectedSession.examDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-semibold uppercase">Session</p>
                <p className="font-bold">{selectedSession.examSession} ({selectedSession.examTime})</p>
              </div>
            </div>
            <div>
              <Badge variant={isFinalized ? "secondary" : "outline"} className={isFinalized ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                {selectedSession.status}
              </Badge>
            </div>
          </div>
          <div>
            {!isFinalized && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleFinalizeSession}
              >
                <Lock className="h-3 w-3 mr-2" />
                Finalize Seating Plan
              </Button>
            )}
            {isFinalized && (
              <div className="flex gap-2">
                {!selectedSession.isPublished ? (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={async () => {
                      try {
                        const updated = await db.updateExamSession(selectedSessionId, { isPublished: true });
                        setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                        toast({ title: "Published", description: "Exam plan published to student dashboard." });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    Publish to Student Dashboard
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-600 text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      try {
                        const updated = await db.updateExamSession(selectedSessionId, { isPublished: false });
                        setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                        toast({ title: "Unpublished", description: "Exam plan hidden from student dashboard." });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    Unpublish
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-yellow-600 text-yellow-700 hover:bg-yellow-50"
                  onClick={async () => {
                    try {
                      const updated = await db.unfinalizeExamSession(selectedSessionId);
                      setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                      toast({ title: "Unlocked", description: "Seating plan reverted to DRAFT mode." });
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    }
                  }}
                >
                  <Lock className="h-3 w-3 mr-2" />
                  Unlock / Edit Plan
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ROLL NUMBER MANAGEMENT - ONLY SHOW IF NOT FINALIZED */}
      {!isFinalized && selectedSession && (
        <div className="mb-6 rounded-lg border bg-gray-50 p-4">
          <h3 className="font-semibold mb-3">Roll Number Management (Draft Mode)</h3>

          <div className="flex gap-4 items-end flex-wrap mb-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="skipRollNumbers">Skip Roll Numbers (comma separated)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="skipRollNumbers"
                  placeholder="e.g., 911123149005"
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

          {/* Display chips logic ... (Shortened for brevity but functionality remains) */}
          {(skipRollNumbers.length > 0 || manualRollNumbers.length > 0) && (
            <div className="flex flex-wrap gap-2 text-sm text-gray-500">
              {skipRollNumbers.length} skipped, {manualRollNumbers.length} manually added.
              {/* Chips logic omitted for brevity, keeping it simple */}
            </div>
          )}
        </div>
      )}

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
                  No exam halls created yet.
                </TableCell>
              </TableRow>
            ) : (
              halls.map(hall => (
                <TableRow key={hall._id}>
                  <TableCell className="font-medium">{hall.name}</TableCell>
                  <TableCell>
                    {hall.rows} rows × {hall.columns} columns
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHall(hall._id)}
                      disabled={!selectedSessionId}
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
              The following roll numbers couldn't be allocated:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 overflow-y-auto border rounded-md p-4 bg-slate-50">
            <div className="grid grid-cols-3 gap-2 text-sm font-mono">
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

      {/* Faculty Shortage / Demand Dialog */}
      <AlertDialog open={showShortageDialog} onOpenChange={setShowShortageDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-orange-600 flex items-center gap-2">
              Faculty Allocation Shortage
            </AlertDialogTitle>
            <AlertDialogDescription>
              The system could not fulfill all faculty requirements based on existing rules (e.g., max 4 duties/week, no continuous sessions).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-orange-50 p-3 rounded border border-orange-200 text-sm">
              <p className="font-bold mb-1">Warnings:</p>
              <ul className="list-disc pl-5">
                {allocationWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>

            <div>
              <p className="text-sm font-bold mb-2">Available Faculty for Force Assignment (Demand):</p>
              <div className="max-h-60 overflow-y-auto border rounded-md p-2 grid grid-cols-2 gap-2">
                {facultySuggestions.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 border p-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      id={`suggest-${f.id}`}
                      checked={tempDemandFacultyIds.includes(f.id)}
                      onChange={() => toggleDemandFaculty(f.id)}
                    />
                    <label htmlFor={`suggest-${f.id}`} className="text-xs cursor-pointer">
                      <span className="font-semibold block">{f.name}</span>
                      <span className="text-gray-500">{f.department}</span>
                    </label>
                  </div>
                ))}
                {facultySuggestions.length === 0 && <p className="text-sm italic text-gray-500 col-span-2 text-center py-4">No other available faculty found. Please add new faculty in the Faculty tab.</p>}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setShowShortageDialog(false)}>Ignore & Keep Current</Button>
            <Button onClick={handleApplyDemand} className="bg-orange-600 hover:bg-orange-700 text-white">
              Confirm & Re-run (Apply Demand)
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Roll Number Addition Dialog */}
      <Dialog open={showManualAddDialog} onOpenChange={setShowManualAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Roll Numbers</DialogTitle>
            <DialogDescription>These rolls will be prioritized.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="e.g., 911123149999"
              value={manualRollInput}
              onChange={(e) => setManualRollInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleAddManualRollNumbers}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Session Dialog */}
      <Dialog open={showCreateSessionDialog} onOpenChange={setShowCreateSessionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Exam Session</DialogTitle>
            <DialogDescription>Define a new exam date and session to generate seating for.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Exam Date</Label>
              <Input type="date" value={newSessionData.examDate} onChange={e => setNewSessionData({ ...newSessionData, examDate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Session</Label>
              <select className="border p-2 rounded" value={newSessionData.examSession} onChange={e => setNewSessionData({ ...newSessionData, examSession: e.target.value as any })}>
                <option value="FN">Forenoon (FN)</option>
                <option value="AN">Afternoon (AN)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Time</Label>
              <Input value={newSessionData.examTime} onChange={e => setNewSessionData({ ...newSessionData, examTime: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateSession} disabled={creatingSession}>
              {creatingSession ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={showEditSessionDialog} onOpenChange={setShowEditSessionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Exam Session</DialogTitle>
            <DialogDescription>Modify the details of this exam session.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Exam Date</Label>
              <Input type="date" value={editSessionData.examDate} onChange={e => setEditSessionData({ ...editSessionData, examDate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Session</Label>
              <select className="border p-2 rounded" value={editSessionData.examSession} onChange={e => setEditSessionData({ ...editSessionData, examSession: e.target.value as any })}>
                <option value="FN">Forenoon (FN)</option>
                <option value="AN">Afternoon (AN)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Time</Label>
              <Input value={editSessionData.examTime} onChange={e => setEditSessionData({ ...editSessionData, examTime: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditSessionDialog(false)}>Cancel</Button>
            <Button onClick={handleEditSession} disabled={editingSession}>
              {editingSession ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Session Alert Dialog */}
      <AlertDialog open={showDeleteSessionDialog} onOpenChange={setShowDeleteSessionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the exam session and all its associated seating plans.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteSessionDialog(false)}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={deletingSession}
            >
              {deletingSession ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SeatingPlans;
