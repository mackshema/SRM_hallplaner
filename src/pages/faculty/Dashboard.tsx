import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { db, Hall } from "@/lib/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assignedHalls, setAssignedHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);

  useEffect(() => {
    const fetchAssignedHalls = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          navigate("/login");
          return;
        }

        setUser(currentUser);

        // ✅ SINGLE SOURCE OF TRUTH - Use id (number) not _id
        const assigned = await db.getFacultyAssignedHalls(currentUser.id);
        setAssignedHalls(assigned);
      } catch (error) {
        console.error("Error fetching assigned halls:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedHalls();
  }, [navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleFacultyExportPDF = () => {
    if (!user || assignedHalls.length === 0) {
      toast({
        title: "No Data",
        description: "No assigned halls to export.",
        variant: "destructive",
      });
      return;
    }

    try {
      const doc = new jsPDF();
      const currentDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Get exam metadata from first hall (all should have same exam date/session/time)
      const firstHall = assignedHalls[0];
      const examDateDisplay = firstHall.examDate || "Not assigned";
      const examSessionDisplay = firstHall.examSession || "";
      const examTimeDisplay = firstHall.examTime || "";

      // Header
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("FACULTY HALL ASSIGNMENT", 105, 20, { align: "center" });

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Faculty Name: ${user.name}`, 14, 30);
      if (examDateDisplay !== "Not assigned") {
        doc.text(`Exam Date: ${examDateDisplay} ${examSessionDisplay ? `(${examSessionDisplay})` : ""}`, 14, 36);
        if (examTimeDisplay) {
          doc.text(`Exam Time: ${examTimeDisplay}`, 14, 42);
          doc.text(`Generated: ${currentDateTime}`, 105, 42, { align: "center" });
        } else {
          doc.text(`Generated: ${currentDateTime}`, 105, 36, { align: "center" });
        }
      } else {
        doc.text(`Generated: ${currentDateTime}`, 105, 30, { align: "center" });
      }

      // Prepare table data
      const tableData = assignedHalls.map((hall) => [
        hall.name || "N/A",
        hall.floor || "Not specified",
        hall.examDate || "Not assigned",
        hall.examSession || "—",
        hall.examTime || "—",
      ]);

      // Create table
      autoTable(doc, {
        head: [["Hall Name", "Floor", "Exam Date", "Session", "Time"]],
        body: tableData,
        startY: 40,
        theme: "grid",
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        styles: {
          fontSize: 10,
          cellPadding: 3,
        },
      });

      // Footer
      const finalY = (doc as any).lastAutoTable.finalY || 40;
      doc.setFontSize(10);
      doc.text("Note: Seating arrangement is managed by the Examination Cell.", 14, finalY + 15);

      const fileNameDate = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/[\/\,:\s]+/g, '-');

      doc.save(`faculty-hall-assignment-${user.name.replace(/\s+/g, '-')}-${fileNameDate}.pdf`);

      toast({
        title: "PDF Exported",
        description: "Hall assignment details exported successfully.",
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Faculty Portal</h1>
            {user && <p className="text-gray-600">Welcome, {user.name}</p>}
          </div>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Assigned Halls</h2>
        </div>

        {loading ? (
          <p>Loading your assigned halls...</p>
        ) : assignedHalls.length > 0 ? (
          assignedHalls.map((hall) => (
            <Card key={hall._id} className="mb-4">
              <CardHeader>
                <CardTitle>{hall.name}</CardTitle>
                <CardDescription>
                  Floor: {hall.floor || "Not specified"}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                <p>
                  <strong>Exam Date:</strong>{" "}
                  {hall.examDate || "Not assigned"}
                </p>
                <p>
                  <strong>Session:</strong>{" "}
                  {hall.examSession || "—"}
                </p>
                <p>
                  <strong>Time:</strong>{" "}
                  {hall.examTime || "—"}
                </p>
              </CardContent>

              <CardFooter>
                <p className="text-sm text-gray-500">
                  Seating arrangement is managed by the Examination Cell.
                </p>
              </CardFooter>
            </Card>
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Assigned Halls</CardTitle>
            </CardHeader>
            <CardContent>
              <p>You have not been assigned to any exam halls yet.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FacultyDashboard;
