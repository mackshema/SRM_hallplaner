
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, Hall, Department } from "@/lib/db";
import { useExam } from "@/context/ExamContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AdminOverview = () => {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const { examDate, setExamDate, examTime, setExamTime, examSession, setExamSession } = useExam();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/halls");
        const hallsData = await res.json();
        setHalls(hallsData);

        const departmentsData = await db.getAllDepartments();
        setDepartments(departmentsData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="text-gray-600">
        Welcome to the Exam Seating Arrangement System. Manage exam halls, departments, and seating plans from here.
      </p>

      {/* Exam Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Exam Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              className="w-full border rounded px-2 py-2"
              value={examSession}
              onChange={(e) => setExamSession(e.target.value as "FN" | "AN")}
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
