
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, Hall, Department, ExamSession } from "@/lib/db";
import { useExam } from "@/context/ExamContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";

const AdminOverview = () => {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [finalizedSessions, setFinalizedSessions] = useState<ExamSession[]>([]);
  const [selectedFinalSession, setSelectedFinalSession] = useState<string>("");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/halls");
        const hallsData = await res.json();
        setHalls(hallsData);

        const departmentsData = await db.getAllDepartments();
        setDepartments(departmentsData);

        const sessionsData = await db.getExamSessions();
        const finals = sessionsData.filter(s => s.status === "FINAL");
        setFinalizedSessions(finals);
        if (finals.length > 0) {
          setSelectedFinalSession(finals[finals.length - 1]._id);
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

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="text-gray-600">
        Welcome to the Exam Seating Arrangement System. Manage exam halls, departments, and seating plans from here.
      </p>

      {/* Exam Export */}
      {finalizedSessions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Exam Package Export</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4 mt-2">
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
          </CardContent>
        </Card>
      )}

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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{departments.length}</p>
            <p className="text-sm text-gray-500">Total departments configured</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {halls.length === 0 && departments.length === 0 ? (
              <p className="text-gray-500">No activity yet. Start by creating exam halls and departments.</p>
            ) : (
              <>
                {halls.map(hall => (
                  <div key={hall._id} className="flex items-center space-x-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <p>Exam hall "{hall.name}" created</p>
                  </div>
                ))}
                {departments.map(dept => (
                  <div key={dept._id} className="flex items-center space-x-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <p>Department "{dept.name}" added</p>
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
