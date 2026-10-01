import React, { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
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
import { Calendar, Clock, Building2, CheckCircle2, UserCheck, Users, ShieldAlert, AlertCircle, Radio, Timer, Upload, Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FacultyDutyHistory from "@/components/FacultyDutyHistory";
import AbsenteeUploadDialog from "@/components/AbsenteeUploadDialog";

const LIVE_BADGE: Record<string, { label: string; className: string }> = {
  UPCOMING: { label: "Upcoming", className: "bg-slate-100 text-slate-700 border-slate-200" },
  LIVE: { label: "Live", className: "bg-red-600 text-white border-red-600 animate-pulse" },
  COMPLETED: { label: "Completed", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

const timeIST = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) : "";

/** "1h 20m" / "12m" / "less than a minute" */
const remaining = (until: string | Date, now: number) => {
  const ms = new Date(until).getTime() - now;
  if (ms <= 60_000) return "less than a minute";
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
};

/** Live status badge computed from start/end at render time (server sends the same). */
const liveStatusOf = (hall: any, now: number): string | null => {
  if (!hall.startAt || !hall.endAt) return hall.liveStatus ?? null;
  if (now < new Date(hall.startAt).getTime()) return "UPCOMING";
  if (now < new Date(hall.endAt).getTime()) return "LIVE";
  return "COMPLETED";
};

const generateGoogleCalendarUrl = (examDate: string, examTime?: string, hallName?: string) => {
  if (!examDate) return "#";
  const dateStr = examDate.replace(/-/g, "");
  const details = encodeURIComponent(`Exam Invigilator Duty at ${hallName || 'Assigned Hall'}. Time Slot: ${examTime || 'Standard Exam Timing'}`);
  const title = encodeURIComponent(`Exam Duty - ${hallName || 'Hall'}`);
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

  // Clock for live status / countdowns, and the absentee upload dialog
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [uploadFor, setUploadFor] = useState<{ planType: string; planId: string; hallId: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

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
          const reqRes = await fetch(`${API_URL}/delegation/requests/${fId}`);
          if (reqRes.ok) {
            const reqs = await reqRes.json();
            setDelegationRequests(reqs);
          }
        } catch (e) {
          console.error("Error fetching delegation requests", e);
        }

        // Fetch all faculty for dropdown
        try {
          const facultiesRes = await fetch(`${API_URL}/users`);
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
  }, [navigate, toast, refreshTick]);

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

      const res = await fetch(`${API_URL}/delegation/request`, {
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
        <Tabs defaultValue="duties">
        <TabsList className="mb-4">
          <TabsTrigger value="duties">Assigned Duties</TabsTrigger>
          <TabsTrigger value="history">My Duties</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">My Exam Duty History</CardTitle>
              <CardDescription>Duties from published exam plans, by exam.</CardDescription>
            </CardHeader>
            <CardContent>
              {user && <FacultyDutyHistory facultyId={String(user._id || user.id)} />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="duties">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Your Assigned Duties</h2>
        </div>

        {loading ? (
          <p>Loading your assigned duties...</p>
        ) : assignedHalls.length > 0 ? (
          assignedHalls.map((hall, index) => {
            if ((hall as any).isScheduled) {
              return (
                <Card key={`${hall._id || index}-${index}`} className="mb-4 shadow-sm border-indigo-200 bg-indigo-50/20">
                  <CardHeader className="bg-indigo-50/50 pb-3 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2 text-indigo-950">
                          <Clock className="h-5 w-5 text-indigo-600" />
                          Exam Duty Announcement Scheduled
                        </CardTitle>
                        <CardDescription className="text-xs text-indigo-700 mt-1">
                          You have an upcoming assigned invigilation duty for this session
                        </CardDescription>
                      </div>
                      <Badge className="w-fit bg-indigo-100 text-indigo-800 border-indigo-200 font-semibold px-3 py-1">
                        {hall.examSession ? `${hall.examSession} Session` : "FN Session"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-50/60 p-3 rounded-lg border border-indigo-100 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Exam Date</p>
                          <p className="font-semibold text-slate-900">{hall.examDate || "Upcoming"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Goes Live</p>
                          <p className="font-semibold text-slate-900">{(hall as any).publish_at_formatted || ((hall as any).publish_at ? new Date((hall as any).publish_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : "Scheduled")}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-indigo-800 italic">
                      {(hall as any).message || `Duty details (hall assignment & students) will be revealed on ${(hall as any).publish_at_formatted}.`}
                    </p>
                  </CardContent>
                </Card>
              );
            }

            if ((hall as any).isReserve) {
              return (
                <Card key={`${hall._id || index}-${index}`} className="mb-4 shadow-sm border-indigo-200 bg-white">
                  <CardHeader className="bg-indigo-50/60 pb-3 border-b border-indigo-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2 text-indigo-950">
                          <ShieldAlert className="h-5 w-5 text-indigo-600" />
                          Reserve Invigilator Duty (Standby)
                        </CardTitle>
                        <CardDescription className="text-xs text-indigo-700 mt-1">
                          You are assigned as standby reserve faculty. Report to Examination Control Cell before the session starts.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {liveStatusOf(hall, now) && (
                          <Badge className={`w-fit border ${LIVE_BADGE[liveStatusOf(hall, now)!].className}`}>{LIVE_BADGE[liveStatusOf(hall, now)!].label}</Badge>
                        )}
                        <Badge className="w-fit bg-indigo-600 text-white font-bold px-3 py-1">
                          {hall.examSession ? `${hall.examSession} Session` : "FN Session"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-50/40 p-3 rounded-lg border border-indigo-100 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Exam Date</p>
                          <p className="font-semibold text-slate-900">{hall.examDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500">Reporting Slot / Time</p>
                          <p className="font-semibold text-slate-900">{hall.examTime || (hall.examSession === 'AN' ? '01:00 PM' : '09:00 AM')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>Standby reserves will be assigned to a hall if any invigilator requires emergency replacement.</span>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
            <Card key={`${hall._id}-${index}`} className="mb-4 shadow-sm border-slate-200">
              <CardHeader className="bg-slate-50/50 pb-3 border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      {hall.name ? `Hall: ${hall.name}` : "Assigned Hall Duty"}
                      {hall.floor && (
                        <Badge variant="outline" className="text-xs font-normal ml-2">
                          {hall.floor}
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-1">
                      Exam duty assigned from official timetable & seating roster
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {liveStatusOf(hall, now) && (
                      <Badge className={`w-fit border gap-1 ${LIVE_BADGE[liveStatusOf(hall, now)!].className}`}>
                        {liveStatusOf(hall, now) === "LIVE" && <Radio className="h-3 w-3" />}
                        {LIVE_BADGE[liveStatusOf(hall, now)!].label}
                      </Badge>
                    )}
                    <Badge className="w-fit bg-blue-100 text-blue-800 border-blue-200 font-semibold px-3 py-1">
                      {hall.examSession ? `${hall.examSession} Session` : "FN Session"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-4">
                {/* Exam Date & Time Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Exam Date</p>
                      <p className="font-semibold text-slate-900">{hall.examDate || "Not assigned"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">Timetable Slot / Time</p>
                      <p className="font-semibold text-slate-900">
                        {(hall as any).startAt && (hall as any).endAt
                          ? `${timeIST((hall as any).startAt)} - ${timeIST((hall as any).endAt)}`
                          : hall.examTime || (hall.examSession === "AN" ? "01:30 PM - 04:30 PM" : "09:30 AM - 12:30 PM")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Absentee upload: own hall only, only inside the window after the exam goes live */}
                {(hall as any).absentee && (() => {
                  const a = (hall as any).absentee;
                  const open = now >= new Date(a.opensAt).getTime() && now <= new Date(a.closesAt).getTime();
                  const closed = now > new Date(a.closesAt).getTime();
                  return (
                    <div className={`rounded-lg border p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${open ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-slate-50"}`}>
                      <div className="space-y-0.5">
                        <p className="font-semibold flex items-center gap-1.5">
                          {open ? <Timer className="h-4 w-4 text-red-600" /> : closed ? <Lock className="h-4 w-4 text-slate-500" /> : <Clock className="h-4 w-4 text-slate-500" />}
                          {open ? `Absentee upload closes in ${remaining(a.closesAt, now)}`
                            : closed ? "Absentee upload closed"
                            : `Absentee upload opens at ${timeIST(a.opensAt)}`}
                        </p>
                        <p className="text-xs text-slate-600">
                          {a.submitted
                            ? `Submitted: ${a.absenteeCount} absent (${new Date(a.submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })})`
                            : closed ? "No absentee list was submitted for this hall." : "Not submitted yet."}
                        </p>
                      </div>
                      {open && (
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1"
                          onClick={() => setUploadFor({ planType: (hall as any).planType, planId: (hall as any).planId, hallId: String(hall._id) })}>
                          <Upload className="h-4 w-4" /> {a.submitted ? "Edit Absentees" : "Upload Absentees"}
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {/* Core Workflow Process Status */}
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Core Process Pipeline Status
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-50 text-emerald-700 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Timetable Uploaded</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-50 text-emerald-700 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Plan Generated</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-50 text-emerald-700 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Hall Allocated</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-50 text-emerald-700 font-medium">
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Faculty Assigned</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-50 text-emerald-700 font-medium col-span-2 sm:col-span-1">
                      <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Students Seated</span>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-3 border-t bg-slate-50/30">
                <p className="text-xs text-slate-500 text-center sm:text-left">
                  Official duty assignment synchronized with Examination Cell timetable.
                </p>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDelegationModal(hall)}
                    className="text-red-500 border-red-200 hover:bg-red-50 flex-1 sm:flex-none text-xs"
                  >
                    Request Emergency Delegation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generateGoogleCalendarUrl(hall.examDate || "", hall.examTime, hall.name), "_blank", "noopener,noreferrer")}
                    className="gap-2 flex-1 sm:flex-none text-xs"
                  >
                    📅 Add to Calendar
                  </Button>
                </div>
              </CardFooter>
            </Card>
          );
        })
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

        </TabsContent>
        </Tabs>

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

      {uploadFor && (
        <AbsenteeUploadDialog
          open
          onClose={() => setUploadFor(null)}
          planType={uploadFor.planType}
          planId={uploadFor.planId}
          hallId={uploadFor.hallId}
          onSubmitted={() => setRefreshTick(n => n + 1)}
        />
      )}

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
