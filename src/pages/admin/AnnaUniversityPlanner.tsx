import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Tesseract from "tesseract.js";
import { Loader2, X, Plus, Calendar, View, CheckCircle2, Lock, Unlock, Eye, EyeOff, Trash2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import AnnaHallView from "@/components/AnnaHallView";
import ExcelUploadHelper from "@/components/ExcelUploadHelper";
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AnnaUniversityPlanner = () => {
  const { toast } = useToast();
  
  // Planners State
  const [allPlans, setAllPlans] = useState<any[]>([]);
  const [examDate, setExamDate] = useState("");
  const [session, setSession] = useState("FN");
  const [seatingPlan, setSeatingPlan] = useState<any>(null);
  
  // Timetable Data
  const [examData, setExamData] = useState<any[]>([]);
  
  // Files
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [lastUploadedName, setLastUploadedName] = useState(localStorage.getItem('anna_timetable_filename') || null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Manual Mapping State
  const [isManualMapOpen, setIsManualMapOpen] = useState(false);
  const [manualMapForm, setManualMapForm] = useState({
    subjectCode: '',
    examDate: '',
    session: 'FN',
    type: 'department',
    year: '',
    department: '',
    rollNumber: ''
  });
  const [mappedPreview, setMappedPreview] = useState<any[] | null>(null);
  const [mapWarning, setMapWarning] = useState<string | null>(null);

  // Layout View State
  const [viewingHallId, setViewingHallId] = useState<string | null>(null);

  const [facultyList, setFacultyList] = useState<any[]>([]);
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

  useEffect(() => {
    fetchAllPlans();
    fetchExamData();
    fetchFacultyList();
  }, []);

  const fetchFacultyList = async () => {
    try {
      const res = await fetch(`${API_URL}/users`);
      const data = await res.json();
      setFacultyList((data || []).filter((u: any) => u.role === 'faculty'));
    } catch (err) {
      console.error("Failed to load faculty list:", err);
    }
  };

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
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFacultyForm.name.trim(),
          username: newFacultyForm.username.trim(),
          department: newFacultyForm.department.trim(),
          password: "faculty123",
          role: 'faculty',
          designation: "Assistant Professor",
          facultyEmail: `${newFacultyForm.username.trim()}@institution.edu`,
          hodEmail: `hod.${newFacultyForm.department.trim().toLowerCase()}@institution.edu`
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create faculty");
      }

      const added = await res.json();
      toast({ title: "Success", description: `Faculty ${added.name} created instantly.` });

      setFacultyList(prev => [...prev, added]);
      setFacultySuggestions(prev => [...prev, { id: added._id || added.id, name: added.name, department: added.department }]);
      setTempDemandFacultyIds(prev => [...prev, String(added._id || added.id)]);
      setNewFacultyForm({ name: "", username: "", department: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to create faculty", variant: "destructive" });
    } finally {
      setCreatingInstantFaculty(false);
    }
  };

  const fetchExamData = async () => {
    try {
      const res = await fetch(`${API_URL}/anna/data`);
      const data = await res.json();
      setExamData(data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load timetable mapping.", variant: "destructive" });
    }
  };

  const fetchAllPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/anna/seating-plans`);
      const data = await res.json();
      setAllPlans(data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load exam sessions.", variant: "destructive" });
    }
  };

  const handleUploadTimetable = async () => {
    if (!timetableFile) return;

    if (timetableFile.type.startsWith('image/')) {
      setIsOcrProcessing(true);
      toast({ title: "Scanning Image", description: "Running OCR to extract mapping..." });
      try {
        const { data: { text } } = await Tesseract.recognize(timetableFile, 'eng');
        const res = await fetch(`${API_URL}/anna/upload-timetable-raw`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ textData: text })
        });
        const data = await res.json();
        if (data.success) {
           toast({ 
             title: "Timetable & Plans Updated", 
             description: `${data.message}${data.generation ? ` Generated ${data.generation.count} sessions.` : ""}` 
           });
           setLastUploadedName(timetableFile.name);
           localStorage.setItem('anna_timetable_filename', timetableFile.name);
           setTimetableFile(null);
           fetchExamData();
           fetchAllPlans();
        } else toast({ title: "Error", description: data.error, variant: "destructive" });
      } catch(e) {
        toast({ title: "OCR Error", description: "Failed to parse image.", variant: "destructive" });
      } finally {
        setIsOcrProcessing(false);
      }
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", timetableFile);
    try {
      // Step 1: Check what will be destroyed (no ?confirmed)
      const checkRes = await fetch(`${API_URL}/anna/upload-timetable`, {
        method: "POST",
        body: formData,
      }).then(r => r.json());

      if (checkRes.requiresConfirmation) {
        // Step 2: Show warning to admin
        const confirmed = window.confirm(
          checkRes.warning + '\n\nClick OK to proceed, Cancel to abort.'
        );
        if (!confirmed) {
          setUploading(false);
          toast({ title: "Cancelled", description: "Upload cancelled — no data deleted." });
          return;
        }

        // Step 3: Confirmed — re-upload with flag
        const confirmData = new FormData();
        confirmData.append("file", timetableFile);
        const res = await fetch(`${API_URL}/anna/upload-timetable?confirmed=true`, {
          method: "POST",
          body: confirmData,
        });
        const data = await res.json();
        if (data.success) {
           toast({ 
             title: "Timetable & Plans Updated", 
             description: `${data.message}${data.generation ? ` Generated ${data.generation.count} sessions.` : ""}` 
           });
           setLastUploadedName(timetableFile.name);
           localStorage.setItem('anna_timetable_filename', timetableFile.name);
           setTimetableFile(null);
           fetchExamData();
           fetchAllPlans();
        } else {
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
      } else {
        if (checkRes.success) {
           toast({ 
             title: "Timetable & Plans Updated", 
             description: `${checkRes.message}${checkRes.generation ? ` Generated ${checkRes.generation.count} sessions.` : ""}` 
           });
           setLastUploadedName(timetableFile.name);
           localStorage.setItem('anna_timetable_filename', timetableFile.name);
           setTimetableFile(null);
           fetchExamData();
           fetchAllPlans();
        } else {
           toast({ title: "Error", description: checkRes.error, variant: "destructive" });
        }
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to upload", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRollFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
          // Extract all strings that could be roll numbers (cells with length > 4)
          const rolls = data.flat().filter(r => r && String(r).length > 4).join(", ");
          setManualMapForm(f => ({ ...f, rollNumber: (f.rollNumber ? f.rollNumber + ", " : "") + rolls }));
      };
      reader.readAsBinaryString(file);
  };

  const handleManualMap = async () => {
    try {
      setMappedPreview(null);
      setMapWarning(null);
      const res = await fetch(`${API_URL}/anna/manual-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manualMapForm)
      });
      const data = await res.json();

      if (data.success) {
        toast({ title: "Success", description: data.message || "Manual mapping successful." });
        if (data.mapped) setMappedPreview(data.mapped);
        if (data.partialError) setMapWarning(data.partialError);
        
        // Only close if it was a generic map or purely successful without warnings
        if (!data.mapped || (!data.partialError && data.mapped.length > 0)) {
           setTimeout(() => { setIsManualMapOpen(false); }, 2000);
        }
        fetchExamData();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        if (data.error.includes("not in the database")) {
           setMapWarning(data.error);
        }
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to register manual mapping.", variant: "destructive" });
    }
  };

  const generateAllSeating = async () => {
    try {
      const res = await fetch(`${API_URL}/anna/generate-all-seating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPerHall: 25, seatsPerBench: 2, demandFacultyIds: tempDemandFacultyIds })
      });
      const data = await res.json();
      if (data.success) {
         toast({ title: "Bulk Generation Complete", description: `Created ${data.count} new plans. Skipped ${data.skipped} existing plans.` });
         fetchAllPlans();

         // Show shortage popup if faculty couldn't be fully allocated
         if (data.shortage && data.allocationWarnings && data.allocationWarnings.length > 0) {
           setAllocationWarnings(data.allocationWarnings);
           setFacultySuggestions(data.facultySuggestions || []);
           setTempDemandFacultyIds([]);
           setShowShortageDialog(true);
         }
      } else {
         toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to generate seating", variant: "destructive" });
    }
  };

  const handleApplyDemand = () => {
    setShowShortageDialog(false);
    generateAllSeating();
  };

  const toggleDemandFaculty = (id: string) => {
    setTempDemandFacultyIds(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const fetchSeatingPlan = async (d?: string, s?: string) => {
     const ed = d || examDate;
     const es = s || session;
     if (!ed || !es) return;

     setExamDate(ed);
     setSession(es);

     try {
       const res = await fetch(`${API_URL}/anna/seating-plan?examDate=${ed}&session=${es}`);
       const data = await res.json();
       if (data.assignments) {
         setSeatingPlan(data);
         if (data.assignments.length === 0) {
           toast({ title: "No Plan Found", description: "No seating plan exists in the database for this date and session." });
         }
       }
     } catch(e) {
       toast({ title: "Error", description: "Failed to load plan", variant: "destructive" });
     }
  };

  const updatePlanStatus = async (updateData: any) => {
    try {
      const res = await fetch(`${API_URL}/anna/update-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examDate, session, ...updateData })
      });
      const data = await res.json();
      if (res.ok) {
        setSeatingPlan(data);
        fetchAllPlans();
        toast({ title: "Success", description: "Plan updated successfully." });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const downloadConsolidatedPackage = () => {
    if (!seatingPlan || seatingPlan.assignments.length === 0) return;
    const edStr = examDate.replace(/\//g, "-");
    window.open(`${API_URL}/anna/export-consolidated/${edStr}/${session}`, "_blank");
  };

  const downloadLayoutsPackage = () => {
    if (!seatingPlan || seatingPlan.assignments.length === 0) return;
    const edStr = examDate.replace(/\//g, "-");
    window.open(`${API_URL}/anna/export-layouts/${edStr}/${session}`, "_blank");
  };

  const handleDeletePlan = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this seating plan? This action cannot be undone.")) return;
    
    try {
      const res = await fetch(`${API_URL}/anna/seating-plan/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Deleted", description: "Seating plan deleted successfully." });
        
        // If we are viewing the deleted plan, go back to sessions view
        if (seatingPlan && seatingPlan._id === id) {
           setSeatingPlan(null);
        }
        fetchAllPlans();
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to delete plan", variant: "destructive" });
    }
  };

  const groupedSeating = React.useMemo(() => {
    if (!seatingPlan || !seatingPlan.assignments) return [];
    const groups: any = {};
    seatingPlan.assignments.forEach((a: any) => {
      const key = `${a.hallId}_${a.subjectCode}_${a.department}`;
      if (!groups[key]) {
        groups[key] = {
          hallName: a.hallName || a.hallId,
          subjectCode: a.subjectCode,
          department: a.department,
          rollNumbers: []
        };
      }
      if (a.rollNumber) groups[key].rollNumbers.push(a.rollNumber);
    });

    const formatRolls = (rolls: any[]) => {
      if (!rolls.length) return "None";
      const sorted = [...rolls].sort((a,b) => {
        const strA = String(a || "");
        const strB = String(b || "");
        const numA = parseInt(strA.replace(/\D/g, ''));
        const numB = parseInt(strB.replace(/\D/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return strA.localeCompare(strB);
      });
      const ranges = [];
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
    })).sort((a: any, b: any) => String(a.hallName || '').localeCompare(String(b.hallName || '')));
  }, [seatingPlan]);

  const uniqueHalls = React.useMemo(() => {
    if (!seatingPlan || !seatingPlan.assignments) return [];
    const hallMap = new Map();
    seatingPlan.assignments.forEach((a: any) => {
      if (!hallMap.has(a.hallId)) {
        hallMap.set(a.hallId, { hallId: a.hallId, hallName: a.hallName, assignments: [] });
      }
      hallMap.get(a.hallId).assignments.push(a);
    });
    return Array.from(hallMap.values()).sort((a: any, b: any) => a.hallName.localeCompare(b.hallName));
  }, [seatingPlan]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Anna University Examination</h1>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Exam Sessions</TabsTrigger>
          <TabsTrigger value="setup">Setup & Timetable</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row space-y-0 justify-between items-center">
              <CardTitle>1. Timetable Feed (Subject Mapping)</CardTitle>
              <Button size="sm" variant="outline" onClick={() => {
                 setMappedPreview(null);
                 setMapWarning(null);
                 setManualMapForm({ subjectCode: '', examDate: '', session: 'FN', type: 'department', year: '', department: '', rollNumber: ''});
                 setIsManualMapOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2"/> Add Manual (Honors/Arrears)
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <ExcelUploadHelper
                columns={[
                  { header: "Subject Code", example: "CS3401",     required: true, description: "Subject code" },
                  { header: "Year",         example: "Year 3",  required: true, description: "Student year/batch" },
                  { header: "Department",   example: "CSE",         required: true, description: "Dept abbreviation" },
                  { header: "Date",         example: "2025-11-10",  required: true, description: "YYYY-MM-DD" },
                  { header: "Session",      example: "FN",          required: true, description: "FN or AN" },
                ]}
                templateFilename="AnnaUniversity_Timetable_Template.xlsx"
                note="One row per subject per department. Supports Excel or image scan."
              />
              <div style={{
                background: "#FCEBEB",
                borderLeft: "4px solid #dc2626",
                padding: "10px 14px",
                borderRadius: "4px",
                marginBottom: "12px",
                fontSize: "13px",
                color: "#7f1d1d",
                lineHeight: "1.5"
              }}>
                <strong>Warning:</strong> Uploading a new timetable will
                permanently delete ALL existing Anna seating plans and
                ALL faculty duty records. This cannot be undone.
                A confirmation will be required before proceeding.
              </div>
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
                    <Button variant="ghost" size="icon" onClick={() => { setLastUploadedName(null); localStorage.removeItem('anna_timetable_filename'); }} className="h-6 w-6 text-slate-500 flex-shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Input type="file" accept=".xlsx, image/*" className="flex-grow" onChange={(e) => setTimetableFile(e.target.files?.[0] || null)} />
                )}
                <Button onClick={handleUploadTimetable} disabled={isOcrProcessing || uploading || !timetableFile}>
                  {(isOcrProcessing || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isOcrProcessing ? "Scanning..." : (uploading ? "Uploading..." : "Upload Timetable")}
                </Button>
              </div>

              {examData.length > 0 && (
                <div className="mt-6 border rounded-md">
                   <Table>
                     <TableHeader className="bg-slate-50">
                       <TableRow>
                         <TableHead>Date</TableHead>
                         <TableHead>Session</TableHead>
                         <TableHead>Subject Code</TableHead>
                         <TableHead>Department</TableHead>
                         <TableHead>Year / Category</TableHead>
                         <TableHead>Specific Roll (if any)</TableHead>
                       </TableRow>
                     </TableHeader>
                      <TableBody>
                        {examData.map((d: any, i: number) => (
                          <TableRow key={i} className={!d.examDate ? "bg-red-50/50" : ""}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {d.examDate ? d.examDate : (
                                <span className="text-red-500 flex items-center gap-1 font-semibold text-xs bg-red-100 px-2 py-1 rounded w-fit">
                                  <AlertCircle className="h-3 w-3" /> Unscheduled
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {d.session ? (
                                <span className={`px-2 py-1 rounded text-xs font-bold ${d.session === 'FN' ? 'bg-orange-100 text-orange-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                  {d.session}
                                </span>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="font-bold">{d.subjectCode}</TableCell>
                            <TableCell>{d.department}</TableCell>
                            <TableCell>{d.year}</TableCell>
                            <TableCell>{d.rollNumber || <span className="text-slate-400 italic">All Matching</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                   </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Exam Generation</CardTitle>
              <CardDescription>Automatically generate seating plans for all dates/sessions present in the active timetable feed</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 items-center bg-slate-50/50 py-6">
              <Button onClick={generateAllSeating} className="bg-primary text-white text-md shadow-sm">
                <Plus className="mr-2 h-5 w-5" /> Generate Exam Plans
              </Button>
              <span className="text-sm text-slate-500 border-l pl-4 border-slate-300">
                This will create new alternate seating plans for every distinct Date & Session in your active Timetable.<br/>
                It intelligently avoids disturbing existing plans!
              </span>
            </CardContent>
          </Card>

          {!seatingPlan ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-800">Available Plans</h2>
              {allPlans.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border rounded-xl bg-slate-50">
                   No seating plans generated yet. Once generated, they will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allPlans.map(plan => (
                     <Card key={plan._id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => fetchSeatingPlan(plan.examDate, plan.session)}>
                       <div className="p-1 w-full bg-primary" />
                       <CardContent className="p-5">
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <h3 className="font-bold text-lg flex items-center gap-2">
                                 <Calendar className="h-4 w-4 text-primary" /> 
                                 {plan.examDate}
                               </h3>
                               <p className="text-sm font-medium text-slate-500">{plan.session} Session</p>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold ${plan.status === 'FINAL' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                               {plan.status || 'DRAFT'}
                            </div>
                         </div>
                         <div className="flex items-center justify-between mt-4">
                           <span className="text-slate-500 text-sm font-medium">{plan.assignments?.length || 0} Students</span>
                           <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => handleDeletePlan(plan._id, e)}>
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
                       {examDate} <span className="text-slate-400 font-medium">|</span> {session} Session
                     </h2>
                     <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeletePlan(seatingPlan._id)}>
                        <Trash2 className="h-4 w-4 mr-1"/> Delete Plan
                     </Button>
                   </div>
                   <p className="text-slate-500 text-sm mt-1">{seatingPlan.assignments?.length || 0} total students arranged.</p>
                 </div>
                 <div className="flex gap-2">
                   <Button variant="outline" onClick={() => setSeatingPlan(null)}>Back to Sessions</Button>
                   <Button onClick={downloadConsolidatedPackage} className="bg-primary text-primary-foreground shadow-sm">
                     Download Consolidated Plan
                   </Button>
                   <Button onClick={downloadLayoutsPackage} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                     Download Bench Layouts
                   </Button>
                 </div>
               </div>

               <div className="rounded-xl border bg-blue-50/50 p-5 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex gap-8 items-center">
                    <div>
                      <span className="text-xs text-slate-500 font-semibold uppercase block mb-2 tracking-wider">Plan Status</span>
                      <div className="flex items-center gap-2">
                         {seatingPlan.status === "FINAL" ? <Lock className="h-4 w-4 text-green-600"/> : <Unlock className="h-4 w-4 text-yellow-600"/>}
                         <span className={`px-2 py-1 rounded text-sm font-bold ${seatingPlan.status === "FINAL" ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                           {seatingPlan.status || "DRAFT"}
                         </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-semibold uppercase block mb-2 tracking-wider">Visibility</span>
                      <div className="flex items-center gap-2">
                         {seatingPlan.isPublished ? <Eye className="h-4 w-4 text-blue-600"/> : <EyeOff className="h-4 w-4 text-slate-400"/>}
                         <span className={`px-2 py-1 rounded text-sm font-bold ${seatingPlan.isPublished ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-700'}`}>
                           {seatingPlan.isPublished ? "PUBLISHED" : "HIDDEN"}
                         </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {seatingPlan.status !== "FINAL" ? (
                      <Button className="bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={() => updatePlanStatus({ status: "FINAL" })}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Finalize Plan
                      </Button>
                    ) : (
                      <>
                        {!seatingPlan.isPublished ? (
                          <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => updatePlanStatus({ isPublished: true })}>
                            Publish to Dashboards
                          </Button>
                        ) : (
                          <Button variant="outline" className="border-red-600 text-red-700 hover:bg-red-50" onClick={() => updatePlanStatus({ isPublished: false })}>
                            Unpublish Plan
                          </Button>
                        )}
                        <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-50" onClick={() => updatePlanStatus({ status: "DRAFT" })}>
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
                        <TabsTrigger value="halls" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Hall Configurations ({uniqueHalls.length})</TabsTrigger>
                        <TabsTrigger value="departments" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Subject/Department Breakdown</TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="halls" className="mt-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-white">
                            <TableHead>Hall ID/Name</TableHead>
                            <TableHead>Total Students</TableHead>
                            <TableHead>Assigned Faculty</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uniqueHalls.map((hallGroup: any, idx: number) => {
                            const assignment = (seatingPlan?.facultyAssignments || []).find((fa: any) => fa.hallId.toString() === hallGroup.hallId.toString());
                            const assignedNames = assignment
                              ? assignment.facultyIds.map((id: string) => {
                                  const fac = facultyList.find((f: any) => f._id === id || f.id === id);
                                  return fac ? fac.name : id;
                                }).join(", ")
                              : "";

                            return (
                              <TableRow key={idx}>
                                <TableCell className="font-medium whitespace-nowrap text-[15px]">{hallGroup.hallName}</TableCell>
                                <TableCell><span className="font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded">{hallGroup.assignments.length}</span> students</TableCell>
                                <TableCell className="text-sm font-medium text-slate-600">
                                  {assignedNames || <span className="text-slate-400 italic">None Assigned</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="outline" size="sm" onClick={() => setViewingHallId(hallGroup.hallId)}>
                                     <View className="h-4 w-4 mr-2" /> View & Configure Hall Layout
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>

                    <TabsContent value="departments" className="mt-0">
                       <Table>
                         <TableHeader>
                           <TableRow className="bg-white">
                             <TableHead>Hall ID/Name</TableHead>
                             <TableHead>Total Students</TableHead>
                             <TableHead>Roll Numbers Range</TableHead>
                             <TableHead>Subject Code</TableHead>
                             <TableHead>Department</TableHead>
                           </TableRow>
                         </TableHeader>
                         <TableBody>
                           {groupedSeating.map((row: any, idx: number) => (
                             <TableRow key={idx}>
                               <TableCell className="font-medium whitespace-nowrap">{row.hallName}</TableCell>
                               <TableCell><span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{row.count}</span></TableCell>
                               <TableCell className="font-bold text-sm leading-relaxed max-w-md">{row.formatted}</TableCell>
                               <TableCell>{row.subjectCode}</TableCell>
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

      {/* Manual Mapping Modal */}
      <Dialog open={isManualMapOpen} onOpenChange={setIsManualMapOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Manual Subject Mapping</DialogTitle>
            <DialogDescription>Add Honors or Arrear students to a specific subject code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-2">
            
            {mapWarning && (
               <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm font-medium">
                 {mapWarning}
               </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject Code</Label>
                <Input value={manualMapForm.subjectCode} onChange={e => setManualMapForm(f => ({ ...f, subjectCode: e.target.value}))} placeholder="e.g. CS101"/>
              </div>
              <div className="space-y-2">
                <Label>Exam Date</Label>
                <Input type="date" value={manualMapForm.examDate} onChange={e => setManualMapForm(f => ({ ...f, examDate: e.target.value}))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Session</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={manualMapForm.session} onChange={e => setManualMapForm(f => ({ ...f, session: e.target.value}))}>
                  <option value="FN">Forenoon (FN)</option>
                  <option value="AN">Afternoon (AN)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Assign By</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={manualMapForm.type} onChange={e => setManualMapForm(f => ({ ...f, type: e.target.value}))}>
                  <option value="department">Department (All Students)</option>
                  <option value="rollNumber">Roll Numbers (Specific Students)</option>
                </select>
              </div>
            </div>

            {manualMapForm.type === 'department' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in duration-300">
                <div className="space-y-2">
                  <Label>Year / Category</Label>
                  <Input value={manualMapForm.year} onChange={e => setManualMapForm(f => ({ ...f, year: e.target.value}))} placeholder="e.g. Year 1"/>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={manualMapForm.department} onChange={e => setManualMapForm(f => ({ ...f, department: e.target.value}))} placeholder="e.g. CSE"/>
                </div>
              </div>
            )}

            {manualMapForm.type === 'rollNumber' && (
              <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="space-y-2">
                  <Label>Student Roll Numbers (Comma Separated)</Label>
                  <Input 
                    value={manualMapForm.rollNumber} 
                    onChange={e => setManualMapForm(f => ({ ...f, rollNumber: e.target.value}))} 
                    placeholder="e.g. 911123, 911124" 
                  />
                </div>
                
                <div className="flex items-center gap-4 border-t pt-4">
                  <div className="text-sm font-medium text-slate-500 whitespace-nowrap">OR Upload Excel</div>
                  <div className="flex-1 space-y-2">
                    <ExcelUploadHelper
                      columns={[
                        { header: "Roll Number", example: "911123104001", required: true, description: "Student roll number" },
                      ]}
                      templateFilename="RollNumbers_Template.xlsx"
                      note="One roll number per row. Column header must be 'Roll Number'."
                    />
                    <Input type="file" accept=".xlsx, .csv" onChange={handleRollFile} className="text-sm" />
                  </div>
                </div>
              </div>
            )}

            {mappedPreview && manualMapForm.type === 'rollNumber' && (
              <div className="mt-6 border rounded-lg overflow-hidden animate-in fade-in zoom-in">
                 <div className="bg-green-50 p-2 font-medium text-green-800 px-4 flex justify-between">
                    <span>Successfully Found & Mapped</span>
                    <span className="font-bold">{mappedPreview.length} students</span>
                 </div>
                 <Table>
                   <TableHeader className="bg-slate-50">
                     <TableRow>
                       <TableHead className="py-2">Roll Number</TableHead>
                       <TableHead className="py-2">Year</TableHead>
                       <TableHead className="py-2">Department</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {mappedPreview.map((s, i) => (
                       <TableRow key={i}>
                         <TableCell className="py-2 font-medium">{s.rollNumber}</TableCell>
                         <TableCell className="py-2">{s.year}</TableCell>
                         <TableCell className="py-2">{s.department}</TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            {mappedPreview && mappedPreview.length > 0 ? (
               <Button onClick={() => setIsManualMapOpen(false)} className="w-full">Done</Button>
            ) : (
               <>
                 <Button variant="outline" onClick={() => setIsManualMapOpen(false)}>Cancel</Button>
                 <Button onClick={handleManualMap}>Save Mapping</Button>
               </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewingHallId} onOpenChange={(val) => { if (!val) setViewingHallId(null) }}>
         <DialogContent className="max-w-5xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Hall Configuration Layout</DialogTitle>
            </DialogHeader>
            <div className="py-2">
               {viewingHallId && seatingPlan && (
                 <AnnaHallView 
                   hallId={viewingHallId} 
                   assignments={seatingPlan.assignments.filter((a: any) => a.hallId === viewingHallId)} 
                   facultyNames={
                     (seatingPlan.facultyAssignments || [])
                       .find((fa: any) => fa.hallId.toString() === viewingHallId.toString())
                       ?.facultyIds.map((id: string) => {
                         const fac = facultyList.find((f: any) => f._id === id || f.id === id);
                         return fac ? fac.name : id;
                       }) || []
                   }
                 />
               )}
            </div>
         </DialogContent>
      </Dialog>

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
    </div>
  );
};

export default AnnaUniversityPlanner;
