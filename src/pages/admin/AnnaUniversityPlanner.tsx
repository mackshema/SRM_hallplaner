import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Tesseract from "tesseract.js";
import { Loader2, X } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AnnaUniversityPlanner = () => {
  const { toast } = useToast();
  const [examDate, setExamDate] = useState("");
  const [session, setSession] = useState("FN");
  const [studentsFile, setStudentsFile] = useState<File | null>(null);
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [seatingPlan, setSeatingPlan] = useState<any>(null);

  const handleUploadStudents = async () => {
    if (!studentsFile) return;
    const formData = new FormData();
    formData.append("file", studentsFile);
    try {
      const res = await fetch(`${API_URL}/anna/upload-students`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) toast({ title: "Success", description: `${data.count} students uploaded.` });
      else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch(e) {
      toast({ title: "Error", description: "Failed to upload", variant: "destructive" });
    }
  };

  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  const handleUploadTimetable = async () => {
    if (!timetableFile) return;

    // Handle Image OCR
    if (timetableFile.type.startsWith('image/')) {
      setIsOcrProcessing(true);
      toast({ title: "Scanning Image", description: "Running OCR to extract mapping..." });
      try {
        const { data: { text } } = await Tesseract.recognize(timetableFile, 'eng');
        
        // Very basic parsing: Look for patterns matching: SubjectCode Date Session Department?
        // Let's send the raw text to the backend to let it parse line by line
        const res = await fetch(`${API_URL}/anna/upload-timetable-raw`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ textData: text })
        });
        
        const data = await res.json();
        if (data.success) toast({ title: "Success", description: `Updated mapping for ${data.updatedSubjects} subjects.` });
        else toast({ title: "Error", description: data.error, variant: "destructive" });

      } catch(e) {
        toast({ title: "OCR Error", description: "Failed to parse image.", variant: "destructive" });
      } finally {
        setIsOcrProcessing(false);
      }
      return;
    }

    const formData = new FormData();
    formData.append("file", timetableFile);
    try {
      const res = await fetch(`${API_URL}/anna/upload-timetable`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) toast({ title: "Success", description: `Updated mapping for ${data.updatedSubjects} subjects.` });
      else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch(e) {
      toast({ title: "Error", description: "Failed to upload", variant: "destructive" });
    }
  };

  const generateSeating = async () => {
    if(!examDate || !session) return toast({ title: "Error", description: "Provide Date and Session", variant: "destructive" });
    
    try {
      const res = await fetch(`${API_URL}/anna/generate-seating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examDate, session, maxPerHall: 25, seatsPerBench: 2 })
      });
      const data = await res.json();
      if (data.success) {
         toast({ title: "Success", description: `Generated seating for ${data.count} students.` });
         fetchSeatingPlan();
      } else {
         toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to generate seating", variant: "destructive" });
    }
  };

  const fetchSeatingPlan = async () => {
     try {
       const res = await fetch(`${API_URL}/anna/seating-plan?examDate=${examDate}&session=${session}`);
       const data = await res.json();
       if (data.assignments) {
         setSeatingPlan(data);
         if (data.assignments.length === 0) {
           toast({ title: "No Plan Found", description: "No seating plan exists in the database for this date and session. Please generate one first." });
         } else {
           toast({ title: "Plan Loaded", description: `Successfully loaded seating for ${data.assignments.length} students.` });
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
        toast({ title: "Success", description: "Plan updated successfully." });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch(e) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const exportPDF = () => {
    if (!seatingPlan || seatingPlan.assignments.length === 0) return;
    
    const doc = new jsPDF("landscape", "pt", "a4");
    doc.setFontSize(18);
    doc.text(`Anna University Examination Seating Plan - ${examDate} (${session})`, 40, 40);
    
    // Group assignments by Hall
    const halls = [...new Set(seatingPlan.assignments.map((a: any) => a.hallName || a.hallId))];
    
    halls.forEach((hall, idx) => {
      if (idx > 0) doc.addPage();
      doc.setFontSize(14);
      doc.text(`Hall: ${hall}`, 40, 70);
      
      const hallAssignments = seatingPlan.assignments.filter((a: any) => (a.hallName || a.hallId) === hall);
      
      autoTable(doc, {
        startY: 90,
        head: [['Row', 'Column', 'Bench', 'Roll Number', 'Subject Code', 'Department']],
        body: hallAssignments.map((a: any) => [
          a.row, a.column, a.benchPosition, a.rollNumber, a.subjectCode, a.department
        ]),
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 5 }
      });
    });
    
    doc.save(`Anna_University_Seating_${examDate}_${session}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Anna University Examination Seating</h1>
      </div>

      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">Setup Requirements</TabsTrigger>
          <TabsTrigger value="generation">Generation & Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. Timetable Feed (Subject Mapping)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">Upload Excel or Image containing: Subject Code, Department, Date, Session.</p>
              <div className="flex gap-4 items-center">
                
                {timetableFile ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2 flex-grow bg-slate-50">
                    <span className="text-sm truncate flex-grow font-medium text-slate-700">{timetableFile.name}</span>
                    <Button variant="ghost" size="icon" onClick={() => setTimetableFile(null)} className="h-6 w-6 text-slate-500 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Input type="file" accept=".xlsx, image/*" className="flex-grow" onChange={(e) => setTimetableFile(e.target.files?.[0] || null)} />
                )}

                <Button onClick={handleUploadTimetable} disabled={isOcrProcessing || !timetableFile}>
                  {isOcrProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isOcrProcessing ? "Scanning..." : "Upload Timetable"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generation">
          <Card>
            <CardHeader>
              <CardTitle>Generate Seating for Date & Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="space-y-2">
                  <Label>Exam Date</Label>
                  <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Session</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={session} onChange={e => setSession(e.target.value)}>
                    <option value="FN">Forenoon (FN)</option>
                    <option value="AN">Afternoon (AN)</option>
                  </select>
                </div>
                <Button onClick={generateSeating} className="bg-primary text-white" disabled={seatingPlan?.status === "FINAL"}>
                  {seatingPlan?.status === "FINAL" ? "Locked (Final)" : "Generate Plan"}
                </Button>
                <Button onClick={fetchSeatingPlan} variant="outline">Load Plan</Button>
                {seatingPlan && seatingPlan.assignments && seatingPlan.assignments.length > 0 && (
                   <Button onClick={exportPDF} variant="secondary">Export Consolidated PDF</Button>
                )}
              </div>

              {seatingPlan && seatingPlan.assignments && seatingPlan.assignments.length > 0 && (
                <div className="mb-6 rounded-lg border bg-blue-50 p-4 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex gap-6 items-center">
                    <div>
                      <span className="text-xs text-blue-600 font-semibold uppercase block mb-1">Status</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${seatingPlan.status === "FINAL" ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                        {seatingPlan.status || "DRAFT"}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-blue-600 font-semibold uppercase block mb-1">Visibility</span>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${seatingPlan.isPublished ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-800'}`}>
                        {seatingPlan.isPublished ? "PUBLISHED" : "HIDDEN"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {seatingPlan.status !== "FINAL" ? (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updatePlanStatus({ status: "FINAL" })}>
                        Finalize Plan
                      </Button>
                    ) : (
                      <>
                        {!seatingPlan.isPublished ? (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => updatePlanStatus({ isPublished: true })}>
                            Publish to Student Dashboard
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="border-red-600 text-red-700 hover:bg-red-50" onClick={() => updatePlanStatus({ isPublished: false })}>
                            Unpublish
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-50" onClick={() => updatePlanStatus({ status: "DRAFT" })}>
                          Unlock / Edit Plan
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {seatingPlan && seatingPlan.assignments.length > 0 && (
                <div className="mt-8 border rounded-md">
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <TableHead>Hall ID/Name</TableHead>
                         <TableHead>Seat (Row/Col/Bench)</TableHead>
                         <TableHead>Roll Number</TableHead>
                         <TableHead>Subject Code</TableHead>
                         <TableHead>Department</TableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {seatingPlan.assignments.map((row: any, idx: number) => (
                         <TableRow key={idx}>
                           <TableCell>{row.hallName || row.hallId}</TableCell>
                           <TableCell>R{row.row}-C{row.column}-B{row.benchPosition}</TableCell>
                           <TableCell>{row.rollNumber}</TableCell>
                           <TableCell>{row.subjectCode}</TableCell>
                           <TableCell>{row.department}</TableCell>
                         </TableRow>
                       ))}
                     </TableBody>
                   </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnnaUniversityPlanner;
