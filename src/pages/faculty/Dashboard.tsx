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
          assignedHalls.map((hall, index) => (
            <Card key={`${hall._id}-${index}`} className="mb-4">
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
