import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Search,
  Filter,
  UserCheck,
  UserX,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  ArrowRightLeft,
  Users
} from "lucide-react";

interface ExamSessionItem {
  id: string;
  planType: "internal" | "anna";
  planId: string;
  examDate: string;
  session: string;
  examTime: string;
  examType: "Internal" | "Anna";
  status: string;
  isPublished: boolean;
  publish_at: string | null;
  reserveCount: number;
}

interface FacultyItem {
  _id: string;
  name: string;
  username: string;
  department?: string;
  designation?: string;
  facultyEmail?: string;
  isAssignedHallDuty: boolean;
  assignedHallName: string | null;
  isAssignedReserve: boolean;
  isConvertedReserve: boolean;
  reserveId: string | null;
  isAvailable: boolean;
  conflictReason: string | null;
}

interface ReserveRecord {
  _id: string;
  facultyId: {
    _id: string;
    name: string;
    username: string;
    department?: string;
    designation?: string;
    facultyEmail?: string;
  };
  examType: string;
  examDate: string;
  examSession: string;
  role: string;
  status: "reserve" | "converted" | "cancelled";
  convertedToHallId?: {
    _id: string;
    name: string;
    floor?: string;
  };
  replacedFacultyId?: {
    _id: string;
    name: string;
    department?: string;
    designation?: string;
  };
  convertedAt?: string;
}

interface HallItem {
  _id: string;
  name: string;
  floor?: string;
  studentCount?: number;
  facultyRequired?: number;
  invigilators: { _id: string; name: string; department?: string }[];
}

const ReserveFacultyPage: React.FC = () => {
  const { toast } = useToast();

  const [sessions, setSessions] = useState<ExamSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<ExamSessionItem | null>(null);

  const [availableFaculty, setAvailableFaculty] = useState<FacultyItem[]>([]);
  const [reserveList, setReserveList] = useState<ReserveRecord[]>([]);
  const [sessionHalls, setSessionHalls] = useState<HallItem[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingFaculty, setLoadingFaculty] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Replacement modal state
  const [replacementModalOpen, setReplacementModalOpen] = useState(false);
  const [selectedReserveForReplace, setSelectedReserveForReplace] = useState<ReserveRecord | null>(null);
  const [targetHallId, setTargetHallId] = useState("");
  const [replacedFacultyId, setReplacedFacultyId] = useState("");
  const [hallFacultyList, setHallFacultyList] = useState<FacultyItem[]>([]);

  // 1. Fetch sessions list on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch(`${API_URL}/reserve-faculty/sessions`);
      if (res.ok) {
        const data: ExamSessionItem[] = await res.json();
        setSessions(data);
        if (data.length > 0 && !selectedSessionId) {
          setSelectedSessionId(data[0].id);
          setSelectedSession(data[0]);
        }
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to load exam sessions.", variant: "destructive" });
    } finally {
      setLoadingSessions(false);
    }
  };

  // 2. Fetch faculty & reserves whenever selectedSession changes
  useEffect(() => {
    if (!selectedSessionId || sessions.length === 0) return;
    const curr = sessions.find(s => s.id === selectedSessionId) || null;
    setSelectedSession(curr);

    if (curr) {
      fetchSessionData(curr);
    }
  }, [selectedSessionId, sessions]);

  const fetchSessionData = async (sess: ExamSessionItem) => {
    setLoadingFaculty(true);
    try {
      const planQuery = `planType=${sess.planType}&planId=${sess.planId}`;
      const [facRes, resRes, hallsRes] = await Promise.all([
        fetch(`${API_URL}/reserve-faculty/available-faculty?${planQuery}`),
        fetch(`${API_URL}/reserve-faculty?${planQuery}`),
        fetch(`${API_URL}/reserve-faculty/plan-halls?${planQuery}`)
      ]);

      if (facRes.ok) {
        const facData = await facRes.json();
        setAvailableFaculty(facData);
      }
      if (resRes.ok) {
        const resData = await resRes.json();
        setReserveList(resData);
      }
      if (hallsRes.ok) {
        const hallsData = await hallsRes.json();
        setSessionHalls(hallsData);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to load faculty roster.", variant: "destructive" });
    } finally {
      setLoadingFaculty(false);
    }
  };

  // Add faculty to reserve
  const handleAddToReserve = async (faculty: FacultyItem) => {
    if (!selectedSession) return;

    if (!faculty.isAvailable) {
      toast({
        title: "Assignment Conflict",
        description: `${faculty.name} can't be a reserve: ${faculty.conflictReason}.`,
        variant: "destructive"
      });
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/reserve-faculty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultyId: faculty._id,
          planType: selectedSession.planType,
          planId: selectedSession.planId
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Added to Reserve",
          description: `${faculty.name} has been assigned as reserve faculty.`
        });
        fetchSessionData(selectedSession);
        fetchSessions();
      } else {
        toast({
          title: "Conflict / Error",
          description: data.error || "Failed to add to reserve.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to add reserve.", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Remove faculty from reserve
  const handleRemoveReserve = async (reserveId: string, facultyName: string) => {
    if (!selectedSession) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/reserve-faculty/${reserveId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast({
          title: "Removed from Reserve",
          description: `${facultyName} removed from reserve list.`
        });
        fetchSessionData(selectedSession);
        fetchSessions();
      } else {
        toast({ title: "Error", description: "Failed to remove reserve.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Open "Use as replacement" dialog
  const openReplacementModal = (reserve: ReserveRecord) => {
    setSelectedReserveForReplace(reserve);
    setTargetHallId("");
    setReplacedFacultyId("");
    setReplacementModalOpen(true);
  };

  // Confirm replacement
  const handleConfirmReplacement = async () => {
    if (!selectedReserveForReplace || !targetHallId || !selectedSession) {
      toast({ title: "Validation Error", description: "Please select a target hall.", variant: "destructive" });
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/reserve-faculty/${selectedReserveForReplace._id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hallId: targetHallId,
          replacedFacultyId: replacedFacultyId || null
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Replacement Assigned",
          description: data.message || "Reserve faculty converted to active hall duty."
        });
        setReplacementModalOpen(false);
        fetchSessionData(selectedSession);
        fetchSessions();
      } else {
        toast({ title: "Error", description: data.error || "Failed to convert reserve.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  // Unique departments for filter
  const departments = Array.from(new Set(availableFaculty.map(f => f.department).filter(Boolean))) as string[];

  // Filtered faculty list
  const filteredFaculty = availableFaculty.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.department && f.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
      f.username.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDepartment === "all" || f.department === selectedDepartment;

    return matchesSearch && matchesDept;
  });

  const activeReserves = reserveList.filter(r => r.status === "reserve");
  const convertedReserves = reserveList.filter(r => r.status === "converted");

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-indigo-600" />
            Reserve Faculty Management
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Assign and manage standby reserve faculty for exam sessions. Standby reserves can quickly replace absent invigilators.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => { if (selectedSession) fetchSessionData(selectedSession); fetchSessions(); }}
          disabled={loadingFaculty || actionLoading}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loadingFaculty ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Exam Session Selector Card */}
      <Card className="border-indigo-100 shadow-sm bg-gradient-to-r from-indigo-50/60 to-blue-50/40">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="exam-session-select" className="text-xs font-semibold uppercase tracking-wider text-indigo-900">
                Select Exam Plan / Session
              </Label>
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={loadingSessions}>
                <SelectTrigger id="exam-session-select" className="bg-white border-indigo-200 shadow-sm h-11 text-sm font-medium">
                  <SelectValue placeholder="Select Exam Session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-800">{s.examDate} ({s.session})</span>
                        <Badge variant="outline" className="text-xs">{s.examType === "Anna" ? "Anna University" : "Internal"}</Badge>
                        <span className="text-[10px] uppercase text-slate-400">{s.status}</span>
                        <span className="text-xs text-slate-500">{s.examTime}</span>
                        {s.reserveCount > 0 && (
                          <Badge className="bg-indigo-600 text-white text-[10px] ml-1">
                            {s.reserveCount} Reserve
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSession && (
              <div className="p-3 bg-white rounded-lg border border-indigo-100 shadow-sm flex flex-col justify-center gap-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Current Plan Status:</span>
                  <Badge className={`text-xs ${
                    selectedSession.status === "PUBLISHED" ? "bg-blue-100 text-blue-800 border-blue-200" :
                    selectedSession.status === "SCHEDULED" ? "bg-indigo-100 text-indigo-800 border-indigo-200" :
                    selectedSession.status === "FINAL" ? "bg-green-100 text-green-800 border-green-200" :
                    "bg-yellow-100 text-yellow-800 border-yellow-200"
                  }`}>
                    {selectedSession.status || "DRAFT"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                  <Clock className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>{selectedSession.examTime}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-medium text-indigo-700">{activeReserves.length} Standby Active</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid: Directory + Selected Reserves */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Faculty Directory (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-600" />
                    Faculty Directory
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Select eligible faculty to assign as standby reserve for this session
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit text-xs">
                  {filteredFaculty.length} Faculty Listed
                </Badge>
              </div>

              {/* Search & Dept Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search faculty name or dept..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 text-xs bg-white"
                  />
                </div>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loadingFaculty ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Loading faculty roster...
                </div>
              ) : filteredFaculty.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No faculty found matching the filter.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {filteredFaculty.map(faculty => {
                    const isReserved = faculty.isAssignedReserve;
                    const isDuty = faculty.isAssignedHallDuty;
                    const isConverted = faculty.isConvertedReserve;

                    return (
                      <div
                        key={faculty._id}
                        className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                          isReserved ? "bg-indigo-50/40" :
                          isDuty ? "bg-slate-50/60 opacity-80" :
                          "hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">{faculty.name}</span>
                            {faculty.designation && (
                              <span className="text-[11px] text-slate-500">({faculty.designation})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">{faculty.department || "General"}</span>
                            <span className="text-slate-300">•</span>
                            <span>{faculty.username}</span>
                          </div>

                          {faculty.conflictReason && (
                            <p className="text-[11px] font-medium text-amber-700 flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              {faculty.conflictReason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isReserved ? (
                            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-semibold px-2.5 py-1 text-xs flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Selected Reserve
                            </Badge>
                          ) : isDuty ? (
                            <Badge variant="outline" className="border-amber-200 text-amber-800 bg-amber-50/60 text-xs">
                              Busy this session
                            </Badge>
                          ) : isConverted ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                              Converted Duty
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleAddToReserve(faculty)}
                              disabled={actionLoading}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 px-3 shadow-sm"
                            >
                              + Add to Reserve
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Selected Reserves Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="shadow-sm border-indigo-200 bg-white">
            <CardHeader className="pb-3 border-b bg-indigo-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-indigo-950 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-indigo-600" />
                    Assigned Reserve Faculty
                  </CardTitle>
                  <CardDescription className="text-xs text-indigo-700">
                    Standby list for {selectedSession?.examDate} ({selectedSession?.session})
                  </CardDescription>
                </div>
                <Badge className="bg-indigo-600 text-white font-bold">
                  {activeReserves.length} Standby
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {activeReserves.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 space-y-2">
                  <UserX className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">No Reserve Faculty Assigned</p>
                  <p className="text-xs text-slate-400">
                    Select faculty from the directory on the left to add them as standby reserves for this exam session.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeReserves.map(reserve => (
                    <div
                      key={reserve._id}
                      className="p-3.5 rounded-lg border border-indigo-100 bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-sm text-slate-900">
                            {reserve.facultyId?.name || "Unknown Faculty"}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {reserve.facultyId?.department || "No Dept"} • {reserve.facultyId?.designation || "Faculty"}
                          </p>
                        </div>
                        <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px] font-semibold">
                          Standby Reserve
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-indigo-100/80">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReplacementModal(reserve)}
                          disabled={actionLoading}
                          className="h-7 text-xs bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1.5 font-medium"
                        >
                          <ArrowRightLeft className="h-3 w-3 text-indigo-600" />
                          Use as Replacement
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveReserve(reserve._id, reserve.facultyId?.name || "Faculty")}
                          disabled={actionLoading}
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Converted Reserves History */}
              {convertedReserves.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                    Converted Replacements ({convertedReserves.length})
                  </span>
                  <div className="space-y-2">
                    {convertedReserves.map(c => (
                      <div key={c._id} className="p-2.5 rounded border border-emerald-100 bg-emerald-50/40 text-xs flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{c.facultyId?.name}</p>
                          <p className="text-[11px] text-emerald-800">
                            Assigned to Hall {c.convertedToHallId?.name || "Assigned"}
                            {c.replacedFacultyId && ` (Replaced ${c.replacedFacultyId.name})`}
                          </p>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                          Converted
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* "Use as Replacement" Dialog */}
      <Dialog open={replacementModalOpen} onOpenChange={setReplacementModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-950">
              <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
              Use Reserve as Replacement
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Assign {selectedReserveForReplace?.facultyId?.name} from standby reserve to an active hall invigilation duty.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs space-y-1">
              <p className="font-semibold text-indigo-900">
                Reserve Faculty: {selectedReserveForReplace?.facultyId?.name}
              </p>
              <p className="text-indigo-700">
                Exam Session: {selectedSession?.examDate} ({selectedSession?.session})
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-hall-select" className="text-xs font-semibold">
                Target Hall *
              </Label>
              <Select value={targetHallId} onValueChange={(v) => { setTargetHallId(v); setReplacedFacultyId(""); }}>
                <SelectTrigger id="target-hall-select" className="h-10 text-sm">
                  <SelectValue placeholder="Select Destination Hall" />
                </SelectTrigger>
                <SelectContent>
                  {sessionHalls.map(h => (
                    <SelectItem key={h._id} value={h._id}>
                      Hall {h.name} {h.floor ? `(${h.floor})` : ""} - {h.invigilators.map(i => i.name).join(", ") || "no invigilator"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetHallId && (
              <div className="space-y-2">
                <Label htmlFor="replaced-select" className="text-xs font-semibold">
                  Replacing (absent invigilator)
                </Label>
                <Select value={replacedFacultyId || "__none__"} onValueChange={(v) => setReplacedFacultyId(v === "__none__" ? "" : v)}>
                  <SelectTrigger id="replaced-select" className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nobody - add as an extra invigilator</SelectItem>
                    {(sessionHalls.find(h => h._id === targetHallId)?.invigilators || []).map(i => (
                      <SelectItem key={i._id} value={i._id}>{i.name}{i.department ? ` (${i.department})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">The replaced invigilator loses this hall duty; the reserve's record is kept and marked as converted.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReplacementModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReplacement}
              disabled={actionLoading || !targetHallId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              {actionLoading ? "Converting..." : "Confirm & Assign Duty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReserveFacultyPage;
