import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, View, Eye, EyeOff, X } from "lucide-react";

import { db, Hall, ExamSession } from "@/lib/db";
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
import { Shuffle, FileDown, Plus, Lock, Unlock, Calendar, Clock, Edit, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HeaderSettings } from "@/lib/exportBenchLayoutWord";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ExcelUploadHelper from "@/components/ExcelUploadHelper";

const SeatingPlans = () => {

  const [settings, setSettings] = useState<HeaderSettings>({
    institutionName: "",
    institutionSubtitle: "",
    institutionAffiliation: "",
    examCellName: "",
    academicYear: "",
    examName: "",
    leftLogo: "",
    rightLogo: ""
  });
  const [halls, setHalls] = useState<Hall[]>([]);

  const [generating, setGenerating] = useState(false);

  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [lastUploadedName, setLastUploadedName] = useState(localStorage.getItem('internal_timetable_filename') || null);
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedSessionAssignments, setSelectedSessionAssignments] = useState<any[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchSeatingPlan = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSearchParams({ sessionId });
    const assignments = await db.getAllSeatAssignments(sessionId);
    setSelectedSessionAssignments(assignments);
  };

  const groupedSeating = React.useMemo(() => {
    if (!selectedSessionAssignments || selectedSessionAssignments.length === 0) return [];
    const groups: any = {};
    selectedSessionAssignments.forEach((a: any) => {
      const hall = halls.find(h => h._id === a.hallId);
      const hallName = hall ? hall.name : a.hallId;
      const key = `${a.hallId}_${a.departmentId}`;
      if (!groups[key]) {
        groups[key] = {
          hallName: hallName,
          department: a.departmentId,
          rollNumbers: []
        };
      }
      if (a.studentRollNumber) groups[key].rollNumbers.push(a.studentRollNumber);
    });

    const formatRolls = (rolls: any[]) => {
      if (!rolls.length) return "None";
      const sorted = [...rolls].sort((a, b) => {
        const strA = String(a || "");
        const strB = String(b || "");
        const numA = parseInt(strA.replace(/\D/g, ''));
        const numB = parseInt(strB.replace(/\D/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return strA.localeCompare(strB);
      });
      const ranges: string[] = [];
      let start = String(sorted[0]), end = String(sorted[0]);
      const getNum = (s: string) => parseInt(String(s).replace(/\D/g, ''));
      const getPref = (s: string) => String(s).replace(/\d/g, '');

      for (let i = 1; i < sorted.length; i++) {
        const curr = String(sorted[i]);
        if (getPref(curr) === getPref(end) && getNum(curr) === getNum(end) + 1) {
          end = curr;
        } else {
          ranges.push(start === end ? start : `${start} - ${end}`);
          start = curr; end = curr;
        }
      }
      ranges.push(start === end ? start : `${start} - ${end}`);
      return ranges.join(", ");
    };

    return Object.values(groups).map((g: any) => ({
      ...g,
      count: g.rollNumbers.length,
      formatted: formatRolls(g.rollNumbers)
    })).sort((a: any, b: any) => String(a.hallName || '').localeCompare(String(b.hallName || ''), undefined, { numeric: true }));
  }, [selectedSessionAssignments, halls]);

  // Derive the list of halls that actually have students in the current session
  const occupiedHalls = React.useMemo(() => {
    if (!selectedSessionAssignments || selectedSessionAssignments.length === 0) return [];
    const hallStudentCount: Record<string, number> = {};
    selectedSessionAssignments.forEach((a: any) => {
      if (!hallStudentCount[a.hallId]) hallStudentCount[a.hallId] = 0;
      hallStudentCount[a.hallId]++;
    });
    return halls
      .filter(h => hallStudentCount[h._id] > 0)
      .map(h => ({ hall: h, studentCount: hallStudentCount[h._id] }))
      .sort((a, b) => String(a.hall.name).localeCompare(String(b.hall.name), undefined, { numeric: true }));
  }, [selectedSessionAssignments, halls]);

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

        // Fetch Exam Sessions
        const sessionsData = await db.getExamSessions();
        setExamSessions(sessionsData);

        // Session Selection Priority:
        // 1. URL search param (?sessionId=...)
        // 2. Already set selectedSessionId
        // 3. Fallback to latest session in sessionsData
        const sessionIdParam = searchParams.get("sessionId");
        let targetId = sessionIdParam || selectedSessionId;

        if (!targetId && sessionsData.length > 0) {
          targetId = sessionsData[sessionsData.length - 1]._id;
        }

        if (targetId) {
          setSelectedSessionId(targetId);
          const assignments = await db.getAllSeatAssignments(targetId);
          setSelectedSessionAssignments(assignments);
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

  const handleUploadTimetable = async () => {
    if (!timetableFile) return;
    const formData = new FormData();
    formData.append("file", timetableFile);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    try {
      const res = await fetch(`${API_URL}/internal-timetable/upload-timetable`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
         toast({ 
           title: "Timetable & Plans Updated", 
           description: `${data.message}${data.generation ? ` Generated ${data.generation.count} sessions.` : ""}` 
         });
         setLastUploadedName(timetableFile.name);
         localStorage.setItem('internal_timetable_filename', timetableFile.name);
         setTimetableFile(null);
         
         // Refresh sessions list
         const sessionsData = await db.getExamSessions();
         setExamSessions(sessionsData);
         if (sessionsData.length > 0) {
            fetchSeatingPlan(sessionsData[sessionsData.length - 1]._id);
         }
      } else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch(e) {
      toast({ title: "Error", description: "Failed to upload", variant: "destructive" });
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
      setSelectedSessionAssignments([]);
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

  const [newFacultyForm, setNewFacultyForm] = useState({
    name: "",
    username: "",
    department: ""
  });
  const [creatingInstantFaculty, setCreatingInstantFaculty] = useState(false);

  const handleInstantCreateFaculty = async () => {
    if (!newFacultyForm.name.trim() || !newFacultyForm.username.trim() || !newFacultyForm.department.trim()) {
      toast({ title: "Error", description: "Please fill all faculty fields", variant: "destructive" });
      return;
    }

    const nameRegex = /^.+\.\s*.+$/;
    if (!nameRegex.test(newFacultyForm.name)) {
      toast({
        title: "Invalid Name Format",
        description: "Name must include initial and full name (Example: R. Kumar).",
        variant: "destructive"
      });
      return;
    }

    setCreatingInstantFaculty(true);
    try {
      const added = await db.addFaculty({
        name: newFacultyForm.name.trim(),
        username: newFacultyForm.username.trim(),
        department: newFacultyForm.department.trim(),
        password: "faculty123",
        designation: "Assistant Professor",
        facultyEmail: `${newFacultyForm.username.trim()}@institution.edu`,
        hodEmail: `hod.${newFacultyForm.department.trim().toLowerCase()}@institution.edu`
      });

      toast({ title: "Success", description: `Faculty ${added.name} created instantly.` });

      setFacultySuggestions(prev => [...prev, { id: added._id || added.id, name: added.name, department: added.department }]);
      setTempDemandFacultyIds(prev => [...prev, String(added._id || added.id)]);
      setNewFacultyForm({ name: "", username: "", department: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create faculty", variant: "destructive" });
    } finally {
      setCreatingInstantFaculty(false);
    }
  };

  const handleBulkTimetableGeneration = async () => {
    setGenerating(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${API_URL}/internal-timetable/generate-all-seating`, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({ demandFacultyIds: tempDemandFacultyIds })
      });
      const data = await res.json();
      if (data.success) {
         const sessionWord = data.count === 1 ? 'session' : 'sessions';

         // AL-03: show warning toast if seat deadlocks occurred, otherwise normal success
         if (data.warnings && data.warnings.length > 0) {
           toast({
             title: '⚠️ Generation Complete with Warnings',
             description: `Generated ${data.count} ${sessionWord}. ${data.warnings.length} seat(s) could not be filled due to constraint deadlocks. Review before finalizing.${data.skipped > 0 ? ` Skipped ${data.skipped} existing.` : ''}`,
             variant: 'destructive'
           });
           console.table(data.warnings); // full detail in console
         } else {
           toast({ title: 'Generation Complete', description: `Generated ${data.count} ${sessionWord}.${data.skipped > 0 ? ` Skipped ${data.skipped} existing.` : ''}` });
         }

         // Refresh sessions
         const sessionsData = await db.getExamSessions();
         setExamSessions(sessionsData);
          if (sessionsData.length > 0 && !selectedSessionId) {
             fetchSeatingPlan(sessionsData[sessionsData.length - 1]._id);
          }

         // Show shortage popup if faculty couldn't be fully allocated
         if (data.shortage && data.allocationWarnings && data.allocationWarnings.length > 0) {
           setAllocationWarnings(data.allocationWarnings);
           setFacultySuggestions(data.facultySuggestions || []);
           setTempDemandFacultyIds([]);
           setShowShortageDialog(true);
         }
      } else {
         toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Generation failed', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyDemand = () => {
    setShowShortageDialog(false);
    handleBulkTimetableGeneration();
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

      if (settings.leftLogo) {
        try {
          const format = settings.leftLogo.substring(settings.leftLogo.indexOf('/') + 1, settings.leftLogo.indexOf(';')).toUpperCase();
          doc.addImage(settings.leftLogo, format, 14, 8, 20, 20);
        } catch (e) { console.error("Logo error", e); }
      }
      if (settings.rightLogo) {
        try {
          const format = settings.rightLogo.substring(settings.rightLogo.indexOf('/') + 1, settings.rightLogo.indexOf(';')).toUpperCase();
          doc.addImage(settings.rightLogo, format, pageWidth - 34, 8, 20, 20);
        } catch (e) { console.error("Logo error", e); }
      }

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
          // String departmentId since we removed models
          const deptName = deptId;

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
              deptName || "Unknown",
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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Internal Examination Seating</h1>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Exam Sessions</TabsTrigger>
          <TabsTrigger value="setup">Setup & Timetable</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row space-y-0 justify-between items-center">
              <CardTitle>Timetable Feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ExcelUploadHelper
                columns={[
                  { header: "Subject Code", example: "CS3401",      required: true, description: "Subject code" },
                  { header: "Year",         example: "Year 2",  required: true, description: "Student year/batch" },
                  { header: "Department",   example: "CSE",          required: true, description: "Dept abbreviation" },
                  { header: "Date",         example: "2025-04-15",   required: true, description: "YYYY-MM-DD" },
                  { header: "Session",      example: "FN",           required: true, description: "FN or AN" },
                ]}
                templateFilename="Internal_Timetable_Template.xlsx"
                note="Each row = one subject for one dept on one date. Add one row per subject-dept combination."
              />
              <div className="flex gap-4 items-center">
                {timetableFile ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2 flex-grow bg-slate-50">
                    <span className="text-sm truncate flex-grow font-medium text-slate-700">{timetableFile.name} (Ready to upload)</span>
                    <Button variant="ghost" size="icon" onClick={() => setTimetableFile(null)} className="h-6 w-6 text-slate-500 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : lastUploadedName ? (
                   <div className="flex items-center gap-2 border border-green-200 rounded-md px-3 py-2 flex-grow bg-green-50 justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm truncate font-medium text-green-800">Currently Active: {lastUploadedName}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setLastUploadedName(null); localStorage.removeItem('internal_timetable_filename'); }} className="h-6 w-6 text-slate-500 flex-shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Input type="file" accept=".xlsx, .xls" className="flex-grow" onChange={(e) => setTimetableFile(e.target.files?.[0] || null)} />
                )}
                <Button onClick={handleUploadTimetable} disabled={!timetableFile}>
                  Upload Timetable
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Exam Generation</CardTitle>
              <CardDescription>Automatically generate seating plans for internal timetable feed</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 items-center bg-slate-50/50 py-6">
              <Button onClick={handleBulkTimetableGeneration} disabled={generating} className="bg-primary text-white text-md shadow-sm">
                <Plus className="mr-2 h-5 w-5" /> {generating ? "Generating..." : "Generate Exam Plans"}
              </Button>
              <span className="text-sm text-slate-500 border-l pl-4 border-slate-300">
                This will create new specific seating plans based on internal rules.
              </span>
            </CardContent>
          </Card>

          {!selectedSessionId ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-800">Available Plans</h2>
              {examSessions.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border rounded-xl bg-slate-50">
                   No seating plans generated yet. Once generated, they will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {examSessions.map(plan => (
                     <Card key={plan._id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => fetchSeatingPlan(plan._id)}>
                       <div className="p-1 w-full bg-primary" />
                       <CardContent className="p-5">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <h3 className="font-bold text-lg flex items-center gap-2">
                                 <Calendar className="h-4 w-4 text-primary" /> 
                                 {plan.examDate}
                               </h3>
                               <p className="text-sm font-medium text-slate-500">{plan.examSession} Session</p>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold ${plan.status === 'FINAL' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                               {plan.status || 'DRAFT'}
                            </div>
                         </div>
                         <div className="flex items-center justify-between mt-4">
                           <span className="text-slate-500 text-sm font-medium">Internal Evaluation</span>
                           <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); setSelectedSessionId(plan._id); setShowDeleteSessionDialog(true); }}>
                                <Trash2 className="h-4 w-4"/>
                             </Button>
                             <Button variant="ghost" size="sm" className="text-primary gap-1">
                                <View className="h-4 w-4"/> View Focus
                             </Button>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
               <div className="flex justify-between items-center bg-white p-4 border rounded-xl shadow-sm">
                 <div>
                   <div className="flex items-center gap-3">
                     <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                       {selectedSession?.examDate} <span className="text-slate-400 font-medium">|</span> {selectedSession?.examSession} Session
                     </h2>
                     <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowDeleteSessionDialog(true)}>
                        <Trash2 className="h-4 w-4 mr-1"/> Delete Plan
                     </Button>
                   </div>
                 </div>
                 <div className="flex gap-2">
                   <Button variant="outline" onClick={() => setSelectedSessionId("")}>Back to Sessions</Button>
                   <Button onClick={exportConsolidatedPlan} className="bg-primary text-primary-foreground shadow-sm">
                     Download Consolidated
                   </Button>
                   <Button onClick={() => window.open(`http://localhost:5000/api/export/full-exam/${selectedSessionId}`, '_blank')} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                     Download Full Package (Docx + Pdf)
                   </Button>
                 </div>
               </div>
               <div className="rounded-xl border bg-blue-50/50 p-5 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex gap-8 items-center">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold uppercase block mb-2 tracking-wider">Plan Status</span>
                      <div className="flex items-center gap-2">
                         {selectedSession?.status === "FINAL" ? <Lock className="h-4 w-4 text-green-600"/> : <Unlock className="h-4 w-4 text-yellow-600"/>}
                         <span className={`px-2 py-1 rounded text-sm font-bold ${selectedSession?.status === 'FINAL' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                           {selectedSession?.status || "DRAFT"}
                         </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-semibold uppercase block mb-2 tracking-wider">Visibility</span>
                      <div className="flex items-center gap-2">
                         {selectedSession?.isPublished ? <Eye className="h-4 w-4 text-blue-600"/> : <EyeOff className="h-4 w-4 text-slate-400"/>}
                         <span className={`px-2 py-1 rounded text-sm font-bold ${selectedSession?.isPublished ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>
                           {selectedSession?.isPublished ? "PUBLISHED" : "HIDDEN"}
                         </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedSession?.status !== "FINAL" ? (
                      <Button className="bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={handleFinalizeSession}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Finalize Plan
                      </Button>
                    ) : (
                      <>
                        {!selectedSession?.isPublished ? (
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={async () => {
                            try {
                              const updated = await db.updateExamSession(selectedSessionId, { isPublished: true });
                              setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                              toast({ title: "Published", description: "Plan published." });
                            } catch (err: any) {
                              toast({ title: "Error", description: err.message, variant: "destructive" });
                            }
                          }}>
                            Publish to Dashboards
                          </Button>
                        ) : (
                          <Button variant="outline" className="border-red-600 text-red-700 hover:bg-red-50" onClick={async () => {
                            try {
                              const updated = await db.updateExamSession(selectedSessionId, { isPublished: false });
                              setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                              toast({ title: "Unpublished", description: "Plan hidden." });
                            } catch (err: any) {
                              toast({ title: "Error", description: err.message, variant: "destructive" });
                            }
                          }}>
                            Unpublish Plan
                          </Button>
                        )}
                        <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-50" onClick={async () => {
                          try {
                            const updated = await db.unfinalizeExamSession(selectedSessionId);
                            setExamSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
                            toast({ title: "Unlocked", description: "Reverted to DRAFT." });
                          } catch (err: any) {
                            toast({ title: "Error", description: err.message, variant: "destructive" });
                          }
                        }}>
                          Unlock / Edit Plan
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="border rounded-md bg-white">
                  <Tabs defaultValue="halls" className="w-full">
                    <div className="p-2 border-b bg-slate-50 rounded-t-md">
                      <TabsList className="bg-transparent border-slate-200 border">
                        <TabsTrigger value="halls" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                          Hall Configurations
                          {occupiedHalls.length > 0 && (
                            <span className="ml-2 bg-primary/10 text-primary text-xs px-1.5 py-0.5 rounded-full font-bold">
                              {occupiedHalls.length}
                            </span>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="departments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Department Breakdown</TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="halls" className="mt-0">
                       {occupiedHalls.length === 0 ? (
                         <div className="text-center py-10 text-slate-400 text-sm italic">
                           No halls have students assigned for this session yet.
                         </div>
                       ) : (
                         <Table>
                           <TableHeader>
                             <TableRow className="bg-white">
                               <TableHead>Hall Name</TableHead>
                               <TableHead>Students Assigned</TableHead>
                               <TableHead>Configuration</TableHead>
                               <TableHead className="text-right">Actions</TableHead>
                             </TableRow>
                           </TableHeader>
                           <TableBody>
                             {occupiedHalls.map(({ hall, studentCount }) => (
                               <TableRow key={hall._id}>
                                 <TableCell className="font-bold whitespace-nowrap text-[15px]">{hall.name}</TableCell>
                                 <TableCell>
                                   <span className="font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded">
                                     {studentCount}
                                   </span>
                                   <span className="text-slate-500 text-sm ml-1">students</span>
                                 </TableCell>
                                 <TableCell className="text-slate-500 text-sm">{hall.rows} rows × {hall.columns} cols</TableCell>
                                 <TableCell className="text-right">
                                   <Button variant="outline" size="sm" onClick={() => handleViewHall(hall._id)}>
                                     <View className="h-4 w-4 mr-2" /> View &amp; Configure Hall
                                   </Button>
                                 </TableCell>
                               </TableRow>
                             ))}
                           </TableBody>
                         </Table>
                       )}
                    </TabsContent>

                    <TabsContent value="departments" className="mt-0">
                       <Table>
                         <TableHeader>
                           <TableRow className="bg-white">
                             <TableHead>Hall Name</TableHead>
                             <TableHead>Total Students</TableHead>
                             <TableHead>Roll Numbers Range</TableHead>
                             <TableHead>Department</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {groupedSeating.map((row: any, idx: number) => (
                             <TableRow key={idx}>
                               <TableCell className="font-medium whitespace-nowrap">{row.hallName}</TableCell>
                               <TableCell><span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{row.count}</span></TableCell>
                               <TableCell className="font-bold text-sm leading-relaxed max-w-md">{row.formatted}</TableCell>
                               <TableCell>{row.department}</TableCell>
                             </TableRow>
                           ))}
                         </TableBody>
                       </Table>
                    </TabsContent>
                  </Tabs>
                </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete / Shortage Dialogs */}
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

            {/* Instant Faculty Creation Form */}
            <div className="border-t pt-4">
              <p className="text-sm font-bold mb-2 text-slate-800">Instantly Add New Faculty Member:</p>
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <Label htmlFor="inst-name" className="text-xs text-slate-600">Full Name (Format: R. Kumar)</Label>
                  <Input 
                    id="inst-name"
                    placeholder="e.g. R. Kumar" 
                    value={newFacultyForm.name} 
                    onChange={e => setNewFacultyForm(prev => ({ ...prev, name: e.target.value }))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="inst-username" className="text-xs text-slate-600">Username / Faculty ID</Label>
                  <Input 
                    id="inst-username"
                    placeholder="e.g. fac_rkumar" 
                    value={newFacultyForm.username} 
                    onChange={e => setNewFacultyForm(prev => ({ ...prev, username: e.target.value }))}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="inst-dept" className="text-xs text-slate-600">Department</Label>
                    <Input 
                      id="inst-dept"
                      placeholder="e.g. CSE" 
                      value={newFacultyForm.department} 
                      onChange={e => setNewFacultyForm(prev => ({ ...prev, department: e.target.value }))}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <Button 
                    size="sm" 
                    onClick={handleInstantCreateFaculty} 
                    disabled={creatingInstantFaculty}
                    className="h-8 text-xs bg-slate-800 hover:bg-slate-900 text-white"
                  >
                    {creatingInstantFaculty ? "Adding..." : "Add"}
                  </Button>
                </div>
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
}

export default SeatingPlans;