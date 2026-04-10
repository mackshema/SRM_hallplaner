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
import { db, Hall, User } from "@/lib/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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
  
  // Delegation State
  const [allFaculty, setAllFaculty] = useState<User[]>([]);
  const [delegationRequests, setDelegationRequests] = useState<any[]>([]);
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);
  const [selectedDuty, setSelectedDuty] = useState<Hall | null>(null);
  const [delegationForm, setDelegationForm] = useState({
    replacementFacultyId: "",
    reason: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

        const fId = currentUser._id || currentUser.id;
        const assigned = await db.getFacultyAssignedHalls(fId as string | number);
        setAssignedHalls(assigned);

        // Fetch Delegation Requests
        try {
          const reqRes = await fetch(`http://localhost:5000/api/delegation/requests/${fId}`);
          if (reqRes.ok) {
            const reqs = await reqRes.json();
            setDelegationRequests(reqs);
          }
        } catch (e) {
          console.error("Error fetching delegation requests", e);
        }

        // Fetch all faculty for dropdown
        try {
          const facultiesRes = await fetch("http://localhost:5000/api/users");
          if (facultiesRes.ok) {
            const facultiesData = await facultiesRes.json();
            setAllFaculty(facultiesData.filter((f: User) => f.role === 'faculty' && f._id !== fId));
          }
        } catch (e) {
          console.error("Error fetching all faculty", e);
        }

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

  const openDelegationModal = (hall: Hall) => {
    setSelectedDuty(hall);
    setDelegationForm({ replacementFacultyId: "", reason: "" });
    setIsDelegationModalOpen(true);
  };

  const handleDelegationSubmit = async () => {
    if (!delegationForm.replacementFacultyId) {
      toast({
        title: "Validation Error",
        description: "Please select a replacement faculty.",
        variant: "destructive",
      });
      return;
    }

    if (!user || (!user._id && !user.id) || !selectedDuty) return;

    setIsSubmitting(true);
    try {
      const payload = {
        requestingFacultyId: user._id || user.id,
        replacementFacultyId: delegationForm.replacementFacultyId,
        examDate: selectedDuty.examDate,
        examSession: selectedDuty.examSession,
        hallNumber: selectedDuty.name, // Or _id if requested, PRD says "Assigned Hall" string
        reason: delegationForm.reason
      };

      const res = await fetch("http://localhost:5000/api/delegation/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({
          title: "Request Submitted",
          description: "Your emergency duty delegation request has been forwarded to the HOD.",
        });
        setIsDelegationModalOpen(false);
      } else {
        toast({
          title: "Error",
          description: "Failed to submit request.",
          variant: "destructive"
        });
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "An error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
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

              <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <p className="text-sm text-gray-500 text-center sm:text-left">
                  Hall and Seating arrangement are managed by the Examination Cell.
                </p>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDelegationModal(hall)}
                    className="text-red-500 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"
                  >
                    Request Emergency Delegation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateGoogleCalendarUrl(hall.examDate || ""), "_blank", "noopener,noreferrer")}
                    className="gap-2 flex-1 sm:flex-none"
                  >
                    📅 Add to Calendar
                  </Button>
                </div>
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

        {/* Delegation Requests History */}
        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-4">Delegation Request History</h2>
          {delegationRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {delegationRequests.map(req => (
                <Card key={req._id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-md">Delegation: {req.examDate} ({req.examSession})</CardTitle>
                    <CardDescription>Hall {req.hallNumber}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <p><strong>Replacement:</strong> {req.replacementFacultyId?.name}</p>
                    <p className="mt-2 text-gray-600 italic">"{req.reason || "No reason provided"}"</p>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="font-semibold text-gray-700">Status: </span>
                      <Badge variant={
                        req.status === 'Accepted' ? 'default' :
                        req.status.includes('Rejected') || req.status === 'Declined' ? 'destructive' :
                        'secondary'
                      }>
                        {req.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No duty delegation requests found.</p>
          )}
        </div>

      </div>

      <Dialog open={isDelegationModalOpen} onOpenChange={setIsDelegationModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Emergency Duty Delegation</DialogTitle>
          </DialogHeader>
          {selectedDuty && user && (
            <div className="space-y-4 py-4">
              <div className="bg-orange-50 p-3 rounded text-sm text-orange-800 border-l-4 border-orange-400">
                <strong>Attention:</strong> This should only be used in emergency situations. Your HOD must approve this request before the replacement faculty is notified.
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm mt-4">
                <div>
                  <span className="text-gray-500">Exam Date: </span>
                  <span className="font-medium">{selectedDuty.examDate}</span>
                </div>
                <div>
                  <span className="text-gray-500">Session: </span>
                  <span className="font-medium">{selectedDuty.examSession}</span>
                </div>
                <div>
                  <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">Hall: {selectedDuty.name}</span>
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label htmlFor="replacement">Select Replacement Faculty *</Label>
                <select
                  id="replacement"
                  className="w-full border p-2 rounded-md bg-white"
                  value={delegationForm.replacementFacultyId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, replacementFacultyId: e.target.value })}
                >
                  <option value="" disabled>-- Select Faculty --</option>
                  {allFaculty.map(f => (
                    <option key={f._id} value={f._id}>
                      {f.name} ({f.department || "No Dept"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Delegation (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain your emergency..."
                  value={delegationForm.reason}
                  onChange={(e) => setDelegationForm({ ...delegationForm, reason: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDelegationModalOpen(false)}>Cancel</Button>
            <Button onClick={handleDelegationSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FacultyDashboard;
