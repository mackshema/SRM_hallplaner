
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, Hall, ExamSession } from "@/lib/db";
import { useExam } from "@/context/ExamContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";

const AdminOverview = () => {
  const [halls, setHalls] = useState<Hall[]>([]);

  const [finalizedSessions, setFinalizedSessions] = useState<ExamSession[]>([]);
  const [selectedFinalSession, setSelectedFinalSession] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  
  // Anna University Export State
  const [annaFinalizedSessions, setAnnaFinalizedSessions] = useState<any[]>([]);
  const [selectedAnnaFinalSession, setSelectedAnnaFinalSession] = useState<string>("");
  const [isAnnaExporting, setIsAnnaExporting] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/halls");
        const hallsData = await res.json();
        setHalls(hallsData);



        const sessionsData = await db.getExamSessions();
        const finals = sessionsData.filter(s => s.status === "FINAL");
        setFinalizedSessions(finals);
        if (finals.length > 0) {
          setSelectedFinalSession(finals[finals.length - 1]._id);
        }

        const annaRes = await fetch("http://localhost:5000/api/anna/seating-plans");
        if (annaRes.ok) {
           const annaSessions = await annaRes.json();
           const annaFinals = annaSessions.filter((s:any) => s.status === "FINAL");
           setAnnaFinalizedSessions(annaFinals);
           if (annaFinals.length > 0) {
             setSelectedAnnaFinalSession(`${annaFinals[annaFinals.length - 1].examDate}|${annaFinals[annaFinals.length - 1].session}`);
           }
        }

      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  const handleDownloadPackage = async () => {
    try {
      setIsExporting(true);

      if (!selectedFinalSession) {
        setIsExporting(false); // Ensure loading state is reset if no session is selected
        return;
      }

      const session = finalizedSessions.find(s => s._id === selectedFinalSession);

      if (!session) {
        toast({ title: "Error", description: "No exam configuration found.", variant: "destructive" });
        setIsExporting(false);
        return;
      }

      // 2. Fetch from backend ZIP route
      const response = await fetch(`http://localhost:5000/api/export/full-exam/${session._id}`);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to download exam package");
      }

      // Trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Exam_Package_${session.examDate.replace(/\//g, "-")}_${session.examSession}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({ title: "Success", description: "Exam package downloaded successfully." });

    } catch (error: any) {
      console.error(error);
      toast({ title: "Download Error", description: error.message || "An unexpected error occurred", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleAnnaDownloadPackage = async (type: 'consolidated' | 'layouts') => {
      try {
        setIsAnnaExporting(true);
        if (!selectedAnnaFinalSession) return;
        const [ed, ses] = selectedAnnaFinalSession.split('|');
        const edStr = ed.replace(/\//g, "-");
        
        const endpoint = type === 'consolidated' ? 'export-consolidated' : 'export-layouts';
        window.open(`http://localhost:5000/api/anna/${endpoint}/${edStr}/${ses}`, "_blank");
        
        // Wait a slight bit before showing success to ensure popup blocker didn't instantly kill it
        setTimeout(() => toast({ title: "Success", description: "Anna University package downloaded successfully." }), 500);
      } catch (error: any) {
        toast({ title: "Download Error", description: error.message || "An unexpected error occurred", variant: "destructive" });
      } finally {
        setIsAnnaExporting(false);
      }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="text-gray-600">
        Welcome to the Exam Seating Arrangement System. Manage exam halls, departments, and seating plans from here.
      </p>

      {/* Exam Export */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Internal Exam Package Export</CardTitle>
        </CardHeader>
        <CardContent className="mt-2">
          {finalizedSessions.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-sm">
                <Label>Select Finalized Exam Plan</Label>
                <select
                  className="w-full border rounded px-2 py-2 mt-1"
                  value={selectedFinalSession}
                  onChange={(e) => setSelectedFinalSession(e.target.value)}
                >
                  {finalizedSessions.map(s => (
                    <option key={s._id} value={s._id}>{s.examDate} ({s.examSession}) - {s.examTime}</option>
                  ))}
                </select>
              </div>
              <div className="mt-5">
                <Button
                  variant="default"
                  onClick={handleDownloadPackage}
                  disabled={isExporting || !selectedFinalSession}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {isExporting ? "Generating ZIP..." : "Download Full Exam Package"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No finalized internal exam plans available yet. Finalize a plan in the Exam Sessions tab to export it here.</p>
          )}
        </CardContent>
      </Card>

      {/* Anna Exam Export */}
      <Card className="border-indigo-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2 bg-indigo-50/50">
          <CardTitle className="text-indigo-900">Anna University Package Export</CardTitle>
        </CardHeader>
        <CardContent className="mt-4">
          {annaFinalizedSessions.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-sm">
                <Label>Select Finalized Exam Plan</Label>
                <select
                  className="w-full border rounded px-2 py-2 mt-1"
                  value={selectedAnnaFinalSession}
                  onChange={(e) => setSelectedAnnaFinalSession(e.target.value)}
                >
                  {annaFinalizedSessions.map(s => (
                    <option key={s._id} value={`${s.examDate}|${s.session}`}>{s.examDate} ({s.session})</option>
                  ))}
                </select>
              </div>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="default"
                  onClick={() => handleAnnaDownloadPackage('consolidated')}
                  disabled={isAnnaExporting || !selectedAnnaFinalSession}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                >
                  {isAnnaExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {isAnnaExporting ? "Generating..." : "Consolidated Plan"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAnnaDownloadPackage('layouts')}
                  disabled={isAnnaExporting || !selectedAnnaFinalSession}
                  className="gap-2"
                >
                  {isAnnaExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  {isAnnaExporting ? "Generating..." : "Layout Plans"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No finalized Anna University exam plans available yet. Finalize a plan in the Anna University tab to export it here.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Exam Halls</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{halls.length}</p>
            <p className="text-sm text-gray-500">Total exam halls configured</p>
          </CardContent>
        </Card>


      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {halls.length === 0 ? (
              <p className="text-gray-500">No activity yet. Start by creating exam halls.</p>
            ) : (
              <>
                {halls.map(hall => (
                  <div key={hall._id} className="flex items-center space-x-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <p>Exam hall "{hall.name}" created</p>
                  </div>
                ))}

              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div >
  );
};

export default AdminOverview;
