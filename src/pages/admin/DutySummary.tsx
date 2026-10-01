import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { planApi, ExamScheduleItem, PlanType, formatIST } from "@/lib/planApi";
import PlanStatusBadge from "@/components/PlanStatusBadge";
import ExportCenterDialog from "@/components/ExportCenterDialog";
import {
  BarChart3, Search, Users, CheckCircle2, Clock, RefreshCw, ShieldAlert, ChevronDown, ChevronUp,
  ArrowUpDown, Plus, Settings2, Trash2, FileDown, Loader2,
} from "lucide-react";

/**
 * Duty Summary per exam schedule (IAT 1, IAT 2, Model, Anna University...).
 * The summary is generated and saved by the server when every plan of the
 * schedule is Published, and regenerated when a plan changes afterwards.
 */

interface DutyDetail { date: string; session: string; examTime?: string; hallName: string; examName: string; subjects?: string[]; role: string; convertedFromReserve?: boolean }
interface FacultyRow { facultyId: string; name: string; department: string; designation: string; dutyCount: number; invigilatorCount: number; reserveCount: number; duties: DutyDetail[] }
interface ReserveRow { facultyId: string; name: string; department: string; designation: string; reserveCount: number; convertedCount: number; records: { date: string; session: string; status: string; convertedHallName: string }[] }
interface Summary {
  isComplete: boolean; totalPlans: number; publishedPlans: number; totalFacultyWithDuty: number; totalDuties: number;
  faculty: FacultyRow[]; reserves: ReserveRow[]; generatedAt: string; generatedReason: string;
}
interface Progress { totalPlans: number; publishedPlans: number; isComplete: boolean; plans: { planType: PlanType; planId: string; examDate: string; session: string; status: string; publish_at: string | null; published: boolean }[] }
interface PlanOption { planType: PlanType; planId: string; examDate: string; session: string; status: string; publish_at: string | null; examScheduleId: string | null }

const ALL = "all";
type SortKey = "dutyCount" | "department" | "name";

const request = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
};

const DutySummaryPage: React.FC = () => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [scheduleId, setScheduleId] = useState<string>("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState(ALL);
  const [sortBy, setSortBy] = useState<SortKey>("dutyCount");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Schedule management
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "IAT1", academicYear: "", semester: "ODD" });
  const [plansOpen, setPlansOpen] = useState(false);
  const [allPlans, setAllPlans] = useState<PlanOption[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const schedule = schedules.find((s) => s._id === scheduleId) || null;
  const categoryLabel = (key: string) => categories.find((c) => c.key === key)?.label || key;

  const loadSchedules = useCallback(async () => {
    try {
      const [list, cats] = await Promise.all([planApi.schedules(), request("GET", "/exam-schedules/categories")]);
      setSchedules(list);
      setCategories(cats);
      setScheduleId((current) => (current && list.some((s) => s._id === current) ? current : list[0]?._id || ""));
    } catch (e: any) {
      toast({ title: "Failed to load schedules", description: e.message, variant: "destructive" });
    }
  }, [toast]);

  const loadSummary = useCallback(async (id: string) => {
    if (!id) { setSummary(null); setProgress(null); return; }
    setLoading(true);
    try {
      const data = await request("GET", `/duty-summary/${id}`);
      setSummary(data.summary);
      setProgress(data.progress);
    } catch (e: any) {
      toast({ title: "Failed to load duty summary", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);
  useEffect(() => { loadSummary(scheduleId); }, [scheduleId, loadSummary]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const data = await request("POST", `/duty-summary/${scheduleId}/regenerate`);
      setSummary(data.summary);
      setProgress(data.progress);
      toast({ title: "Duty summary regenerated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const createSchedule = async () => {
    setSaving(true);
    try {
      const created = await request("POST", "/exam-schedules", form);
      toast({ title: `Schedule "${created.name}" created`, description: "Now choose the seating plans that belong to it." });
      setCreateOpen(false);
      setForm({ name: "", category: form.category, academicYear: form.academicYear, semester: form.semester });
      await loadSchedules();
      setScheduleId(created._id);
      openPlans(created._id);
    } catch (e: any) {
      toast({ title: "Can't create schedule", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openPlans = async (id = scheduleId) => {
    try {
      const plans: PlanOption[] = await request("GET", "/exam-schedules/plans");
      setAllPlans(plans);
      setChosen(new Set(plans.filter((p) => p.examScheduleId === id).map((p) => `${p.planType}:${p.planId}`)));
      setPlansOpen(true);
    } catch (e: any) {
      toast({ title: "Failed to load plans", description: e.message, variant: "destructive" });
    }
  };

  const savePlans = async () => {
    setSaving(true);
    try {
      const plans = [...chosen].map((k) => { const [planType, planId] = k.split(":"); return { planType, planId }; });
      await request("PUT", `/exam-schedules/${scheduleId}/plans`, { plans });
      setPlansOpen(false);
      toast({ title: "Schedule plans updated" });
      await loadSchedules();
      await loadSummary(scheduleId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async () => {
    if (!schedule || !confirm(`Delete schedule "${schedule.name}"? Its plans are kept, only unlinked.`)) return;
    try {
      await request("DELETE", `/exam-schedules/${schedule._id}`);
      toast({ title: "Schedule deleted" });
      setScheduleId("");
      await loadSchedules();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const departments = useMemo(
    () => [...new Set((summary?.faculty || []).map((f) => f.department).filter(Boolean))].sort(),
    [summary]
  );

  const matches = (r: { name: string; department: string; designation: string }) => {
    const q = search.trim().toLowerCase();
    return (department === ALL || r.department === department) &&
      (!q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q) || r.designation.toLowerCase().includes(q));
  };

  const facultyRows = useMemo(() => {
    const dir = sortDesc ? -1 : 1;
    return (summary?.faculty || []).filter(matches).sort((a, b) => {
      if (sortBy === "dutyCount") return dir * (a.dutyCount - b.dutyCount) || a.name.localeCompare(b.name);
      if (sortBy === "department") return dir * a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
      return dir * a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, search, department, sortBy, sortDesc]);

  const reserveRows = (summary?.reserves || []).filter(matches);
  const pending = (progress?.plans || []).filter((p) => !p.published);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-indigo-600" /> Duty Summary
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Generated automatically once every seating plan of an exam schedule is published, and kept up to date if a plan changes later.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0"><Plus className="h-4 w-4" /> New Exam Schedule</Button>
      </div>

      {schedules.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-slate-500">
          No exam schedules yet. Create one (e.g. "IAT 1") and add its seating plans to get a duty summary.
        </CardContent></Card>
      ) : (
        <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-blue-50/40">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5 min-w-[260px]">
                <Label className="text-xs font-semibold uppercase tracking-wider text-indigo-900">Exam Schedule</Label>
                <Select value={scheduleId} onValueChange={setScheduleId}>
                  <SelectTrigger className="bg-white h-10"><SelectValue placeholder="Select schedule" /></SelectTrigger>
                  <SelectContent>
                    {schedules.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name} {s.academicYear ? `(${s.academicYear})` : ""} - {categoryLabel(s.category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {progress && (
                progress.isComplete ? (
                  <Badge className="bg-green-600 text-white h-8 px-3 gap-1"><CheckCircle2 className="h-4 w-4" /> Complete - all {progress.totalPlans} plans published</Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-900 border-amber-200 h-8 px-3 gap-1">
                    <Clock className="h-4 w-4" /> {progress.publishedPlans} of {progress.totalPlans} plans published
                  </Badge>
                )
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" className="gap-1" onClick={() => openPlans()}><Settings2 className="h-4 w-4" /> Plans</Button>
                <Button variant="outline" className="gap-1" onClick={regenerate} disabled={regenerating || !scheduleId}>
                  <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
                </Button>
                <Button variant="outline" className="gap-1" onClick={() => setExportOpen(true)} disabled={!summary}><FileDown className="h-4 w-4" /> Export</Button>
                <Button variant="ghost" size="icon" className="text-red-600" onClick={deleteSchedule} title="Delete schedule"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>

            {progress && progress.totalPlans === 0 && (
              <p className="text-sm text-slate-600">This schedule has no seating plans yet. Use <b>Plans</b> to add them.</p>
            )}
            {pending.length > 0 && (
              <div className="text-sm text-slate-700">
                <span className="font-medium">Waiting for:</span>{" "}
                {pending.map((p) => (
                  <span key={p.planId} className="inline-flex items-center gap-1 mr-3">
                    {p.examDate} {p.session}{p.planType === "anna" ? " (Anna)" : ""} <PlanStatusBadge status={p.status} publishAt={p.publish_at} showTime={false} />
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...</div>
      ) : scheduleId && !summary ? (
        <Card><CardContent className="py-12 text-center text-slate-500">
          The duty summary will be generated automatically when all plans of this schedule are published
          {progress ? ` (${progress.publishedPlans} of ${progress.totalPlans} so far)` : ""}. Use <b>Regenerate</b> for a preview now.
        </CardContent></Card>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Faculty with duty", value: summary.totalFacultyWithDuty, icon: Users },
              { label: "Total duties", value: summary.totalDuties, icon: BarChart3 },
              { label: "Reserve faculty", value: summary.reserves.length, icon: ShieldAlert },
              { label: "Generated", value: formatIST(summary.generatedAt), icon: Clock, small: true },
            ].map(({ label, value, icon: Icon, small }) => (
              <Card key={label}><CardContent className="p-4">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <p className={`${small ? "text-sm" : "text-2xl"} font-bold text-slate-900 mt-1`}>{value}</p>
              </CardContent></Card>
            ))}
          </div>
          {!summary.isComplete && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Not every plan of this schedule is published yet, so this summary only covers the published ones.
            </p>
          )}

          <Tabs defaultValue="faculty">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="faculty" className="gap-2"><Users className="h-4 w-4" /> Faculty ({summary.faculty.length})</TabsTrigger>
                <TabsTrigger value="reserve" className="gap-2"><ShieldAlert className="h-4 w-4" /> Reserve ({summary.reserves.length})</TabsTrigger>
              </TabsList>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search faculty..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 w-[220px]" />
                </div>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All departments</SelectItem>
                    {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                  <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dutyCount">Sort: Duty count</SelectItem>
                    <SelectItem value="department">Sort: Department</SelectItem>
                    <SelectItem value="name">Sort: Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setSortDesc((v) => !v)}>
                  <ArrowUpDown className="h-3.5 w-3.5" /> {sortDesc ? "Desc" : "Asc"}
                </Button>
              </div>
            </div>

            <TabsContent value="faculty">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faculty</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead className="text-center">Invigilator</TableHead>
                      <TableHead className="text-center">Reserve</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facultyRows.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No faculty match the filters.</TableCell></TableRow>
                    )}
                    {facultyRows.map((f) => (
                      <React.Fragment key={f.facultyId}>
                        <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === f.facultyId ? null : f.facultyId)}>
                          <TableCell className="font-medium">{f.name}</TableCell>
                          <TableCell>{f.department || "-"}</TableCell>
                          <TableCell className="text-xs">{f.designation || "-"}</TableCell>
                          <TableCell className="text-center">{f.invigilatorCount}</TableCell>
                          <TableCell className="text-center">{f.reserveCount}</TableCell>
                          <TableCell className="text-center"><Badge className="bg-indigo-600 text-white">{f.dutyCount} dut{f.dutyCount === 1 ? "y" : "ies"}</Badge></TableCell>
                          <TableCell>{expanded === f.facultyId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                        </TableRow>
                        {expanded === f.facultyId && (
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                            <TableCell colSpan={7}>
                              <div className="grid gap-1.5 text-sm">
                                {f.duties.map((d, i) => (
                                  <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5">
                                    <span className="font-medium w-28">{d.date}</span>
                                    <span className="w-10">{d.session}</span>
                                    <span className="w-40">{d.role === "reserve" ? "Reserve" : `Hall ${d.hallName}`}{d.convertedFromReserve ? " (from reserve)" : ""}</span>
                                    <span className="text-slate-500">{d.examName}{d.subjects?.length ? ` - ${d.subjects.join(", ")}` : ""}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="reserve">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faculty</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-center">Reserve count</TableHead>
                      <TableHead className="text-center">Converted</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reserveRows.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No reserve faculty.</TableCell></TableRow>
                    )}
                    {reserveRows.map((r) => (
                      <TableRow key={r.facultyId}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.department || "-"}</TableCell>
                        <TableCell className="text-center">{r.reserveCount}</TableCell>
                        <TableCell className="text-center">{r.convertedCount}</TableCell>
                        <TableCell className="text-xs">
                          {r.records.map((x, i) => (
                            <span key={i} className="block">
                              {x.date} {x.session} - {x.status === "converted" ? `used as replacement in Hall ${x.convertedHallName}` : "standby"}
                            </span>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      {/* Create schedule */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Exam Schedule</DialogTitle>
            <DialogDescription>An exam cycle such as IAT 1 for this semester. Its seating plans are grouped under it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. IAT 1" /></div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Academic Year</Label><Input value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="2026-2027" /></div>
              <div className="space-y-1">
                <Label>Semester</Label>
                <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ODD">ODD</SelectItem><SelectItem value="EVEN">EVEN</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createSchedule} disabled={saving || !form.name.trim()}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plans of the schedule */}
      <Dialog open={plansOpen} onOpenChange={setPlansOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seating plans in {schedule?.name}</DialogTitle>
            <DialogDescription>A plan belongs to one schedule at a time. The schedule is Complete when every checked plan is Published.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {allPlans.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No seating plans yet.</p>}
            {allPlans.map((p) => {
              const key = `${p.planType}:${p.planId}`;
              const other = p.examScheduleId && p.examScheduleId !== scheduleId ? schedules.find((s) => s._id === p.examScheduleId) : null;
              return (
                <label key={key} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <Checkbox
                    checked={chosen.has(key)}
                    onCheckedChange={(c) => setChosen((prev) => { const next = new Set(prev); if (c) next.add(key); else next.delete(key); return next; })}
                  />
                  <span className="text-sm font-medium w-36">{p.examDate} {p.session}</span>
                  <Badge variant="outline" className="text-[10px]">{p.planType === "anna" ? "Anna University" : "Internal"}</Badge>
                  <PlanStatusBadge status={p.status} publishAt={p.publish_at} showTime={false} />
                  {other && <span className="text-[11px] text-amber-700 ml-auto">in "{other.name}" - will move</span>}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlansOpen(false)}>Cancel</Button>
            <Button onClick={savePlans} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save ({chosen.size})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {schedule && (
        <ExportCenterDialog open={exportOpen} onClose={() => setExportOpen(false)} target={{ kind: "schedule", scheduleId: schedule._id, label: schedule.name }} />
      )}
    </div>
  );
};

export default DutySummaryPage;
