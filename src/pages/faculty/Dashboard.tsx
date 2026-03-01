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

const generateGoogleCalendarUrl = (examDate: string) => {
  if (!examDate) return "#";
  const dateStr = examDate.replace(/-/g, "");
  // Assume all-day event
  const details = encodeURIComponent("Exam Duty assigned by Examination Cell.");
  const title = encodeURIComponent("Exam Duty");
  // Google Calendar format: YYYYMMDD/YYYYMMDD
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}/${dateStr}&details=${details}`;
};

const FacultyDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assignedHalls, setAssignedHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);

  // Request Notification permission
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    let lastCount = -1;

    const fetchAssignedHalls = async () => {
      try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          navigate("/login");
          return;
        }

        setUser(currentUser);

        // Fix ID to use _id from backend
        const fId = currentUser._id || currentUser.id;
        const assigned = await db.getFacultyAssignedHalls(fId as string | number);
        setAssignedHalls(assigned);

        // Check for new notifications
        if (lastCount !== -1 && assigned.length > lastCount) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Hall Harmony Notification", {
              body: "Your Exam Duty plan has been updated or newly announced!",
            });
          } else {
            // Fallback to toast
            toast({
              title: "Plan Updated",
              description: "Your Exam Duty plan has been updated or newly announced!",
            });
          }
        }
        lastCount = assigned.length;
      } catch (error) {
        console.error("Error fetching assigned halls:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedHalls();

    // Poll every 10 seconds to show popup when plan is updated centrally
    const interval = setInterval(fetchAssignedHalls, 10000);
    return () => clearInterval(interval);
  }, [navigate, toast]);

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
          <div className="flex gap-2">
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Assigned Duties</h2>
        </div>

        {loading ? (
          <p>Loading your assigned duties...</p>
        ) : assignedHalls.length > 0 ? (
          assignedHalls.map((hall, index) => (
            <Card key={`${hall._id}-${index}`} className="mb-4">
              <CardHeader>
                <CardTitle>Exam Duty</CardTitle>
                <CardDescription>
                  Details will be communicated by the Examination Cell
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                <p>
                  <strong>Exam Date:</strong>{" "}
                  {hall.examDate || "Not assigned"}
                </p>
              </CardContent>

              <CardFooter className="flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  Hall and Seating arrangement are managed by the Examination Cell.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(generateGoogleCalendarUrl(hall.examDate || ""), "_blank", "noopener,noreferrer")}
                  className="gap-2"
                >
                  📅 Add to Google Calendar
                </Button>
              </CardFooter>
            </Card>
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Duties Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <p>You have not been assigned to any exam duties yet.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FacultyDashboard;
