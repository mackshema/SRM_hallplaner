import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatIST, PlanType } from "@/lib/planApi";
import { Loader2, RefreshCw, TimerReset } from "lucide-react";

/**
 * Admin absentee report for one plan: per hall submitted / not submitted,
 * count and list, a badge when the window closed without a submission, and
 * re-opening the window (reason required, logged).
 */

interface HallRow {
  hallId: string;
  hallName: string;
  studentCount: number;
  invigilators: { _id: string; name: string }[];
  submitted: boolean;
  submittedAt: string | null;
  submittedByName: string;
  absenteeCount: number;
  absentees: string[];
  window: { opensAt: string; closesAt: string; isOpen: boolean; isClosed: boolean; extended: boolean } | null;
  closedWithoutSubmission: boolean;
  extensions: { extendedUntil: string; reason: string; grantedBy: string; facultyName: string; createdAt: string }[];
}

interface Report {
  liveStatus: string | null;
  defaultWindowMinutes: number;
  plan: { start_at: string | null; end_at: string | null; absentee_window_minutes: number | null };
  totals: { halls: number; submitted: number; absentees: number; closedWithoutSubmission: number };
  halls: HallRow[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  planType: PlanType;
  planId: string;
  label: string;
}

const AbsenteeReportDialog: React.FC<Props> = ({ open, onClose, planType, planId, label }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [extendFor, setExtendFor] = useState<HallRow | null>(null);
  const [minutes, setMinutes] = useState("30");
  const [reason, setReason] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/absentees/report/${planType}/${planId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load report");
      setReport(data);
    } catch (e: any) {
      toast({ title: "Absentee report", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [planType, planId, toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const extend = async () => {
    if (!extendFor) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/absentees/${planType}/${planId}/${extendFor.hallId}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: Number(minutes), reason, facultyId: facultyId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extend");
      toast({ title: "Window re-opened", description: data.message });
      setExtendFor(null);
      setReason("");
      setFacultyId("");
      load();
    } catch (e: any) {
      toast({ title: "Can't extend window", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const windowText = (h: HallRow) => {
    if (!h.window) return "Timing not set";
    if (h.window.isOpen) return `Open until ${formatIST(h.window.closesAt)}`;
    if (h.window.isClosed) return `Closed ${formatIST(h.window.closesAt)}`;
    return `Opens ${formatIST(h.window.opensAt)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Absentee Report
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>

        {!report ? (
          <div className="py-10 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading...</div>
        ) : (
          <div className="space-y-3">
            {!report.plan.start_at && (
              <p className="rounded-md bg-amber-50 border border-amber-200 p-2 text-sm text-amber-800">
                Exam timing isn't set for this plan, so invigilators can't upload absentees yet. Set it in the publish dialog.
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{report.totals.submitted} of {report.totals.halls} halls submitted</Badge>
              <Badge variant="secondary">{report.totals.absentees} absentees</Badge>
              {report.totals.closedWithoutSubmission > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200">{report.totals.closedWithoutSubmission} closed without submission</Badge>
              )}
              {report.liveStatus && <Badge variant="outline">{report.liveStatus}</Badge>}
              <span className="text-xs text-slate-500 self-center">
                Window: {report.plan.absentee_window_minutes ?? report.defaultWindowMinutes} min after start
              </span>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hall</TableHead>
                    <TableHead>Invigilator(s)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Absent</TableHead>
                    <TableHead>Absentees</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.halls.map((h) => (
                    <TableRow key={h.hallId} className={h.closedWithoutSubmission ? "bg-red-50/60" : ""}>
                      <TableCell className="font-medium">{h.hallName}<span className="block text-[11px] text-slate-500">{h.studentCount} students</span></TableCell>
                      <TableCell className="text-xs">{h.invigilators.map((f) => f.name).join(", ") || "-"}</TableCell>
                      <TableCell>
                        {h.submitted ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200">Submitted</Badge>
                        ) : h.closedWithoutSubmission ? (
                          <Badge className="bg-red-100 text-red-800 border-red-200">Closed - not submitted</Badge>
                        ) : (
                          <Badge variant="outline">Not submitted</Badge>
                        )}
                        {h.submittedAt && <span className="block text-[11px] text-slate-500">{h.submittedByName}, {formatIST(h.submittedAt)}</span>}
                      </TableCell>
                      <TableCell className="text-center font-semibold">{h.submitted ? h.absenteeCount : "-"}</TableCell>
                      <TableCell className="text-xs max-w-[220px]">{h.absentees.join(", ") || "-"}</TableCell>
                      <TableCell className="text-xs">
                        {windowText(h)}
                        {h.extensions.map((e, i) => (
                          <span key={i} className="block text-[11px] text-indigo-700">
                            Extended to {formatIST(e.extendedUntil)} by {e.grantedBy}{e.facultyName ? ` for ${e.facultyName}` : ""}: {e.reason}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={!h.window} onClick={() => { setExtendFor(h); setFacultyId(""); }}>
                          <TimerReset className="h-3.5 w-3.5" /> Re-open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {extendFor && (
              <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
                <p className="text-sm font-semibold">Re-open / extend the window for Hall {extendFor.hallName}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Minutes</Label>
                    <Input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">For</Label>
                    <select className="h-8 w-full rounded-md border px-2 text-sm bg-white" value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
                      <option value="">Whole hall</option>
                      {extendFor.invigilators.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Reason *</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it being re-opened?" className="h-8" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setExtendFor(null)}>Cancel</Button>
                  <Button size="sm" disabled={saving || !reason.trim()} onClick={extend}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Re-open window
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AbsenteeReportDialog;
