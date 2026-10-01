import React, { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { planApi, PlanType } from "@/lib/planApi";
import { FileDown, FileSpreadsheet, FileText, Loader2, Package } from "lucide-react";

/**
 * Export screen for one plan or one exam schedule: every document as Excel,
 * PDF or both, and "Download all" as a background job with a progress bar.
 */

type Format = "xlsx" | "pdf" | "both";

type Target =
  | { kind: "plan"; planType: PlanType; planId: string; label: string }
  | { kind: "schedule"; scheduleId: string; label: string };

interface Props {
  open: boolean;
  onClose: () => void;
  target: Target;
}

const FORMATS: { key: Format; label: string; icon: React.ElementType }[] = [
  { key: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "both", label: "Both", icon: Package },
];

interface JobState { id: string; status: string; progress: number; message: string; fileName: string; error?: string }

const ExportCenterDialog: React.FC<Props> = ({ open, onClose, target }) => {
  const { toast } = useToast();
  const [format, setFormat] = useState<Format>("both");
  const [docs, setDocs] = useState<{ key: string; title: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!open) return;
    cancelled.current = false;
    setJob(null);
    planApi.exportConfig()
      .then((c) => setDocs(target.kind === "plan" ? c.planDocuments : c.scheduleDocuments))
      .catch((e) => toast({ title: "Failed to load exports", description: e.message, variant: "destructive" }));
    return () => { cancelled.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target.kind]);

  const docUrl = (key: string) =>
    target.kind === "plan"
      ? `${API_URL}/exports/plan/${target.planType}/${target.planId}/${key}?format=${format}`
      : `${API_URL}/exports/schedule/${target.scheduleId}/${key}?format=${format}`;

  const downloadDoc = async (key: string, title: string) => {
    setBusy(key);
    try {
      await downloadFromApi(docUrl(key), `${title}.${format === "both" ? "zip" : format}`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const downloadAll = async () => {
    setBusy("__all__");
    try {
      const url = target.kind === "plan"
        ? `${API_URL}/exports/plan/${target.planType}/${target.planId}/package`
        : `${API_URL}/exports/schedule/${target.scheduleId}/package`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      let state: JobState = await res.json();
      if (!res.ok) throw new Error((state as any).error || "Failed to start export");
      setJob(state);
      while (!cancelled.current && state.status !== "done" && state.status !== "failed") {
        await new Promise((r) => setTimeout(r, 700));
        const poll = await fetch(`${API_URL}/exports/jobs/${state.id}`);
        state = await poll.json();
        if (!poll.ok) throw new Error((state as any).error || "Export job lost");
        setJob(state);
      }
      if (state.status === "failed") throw new Error(state.error || "Export failed");
      if (state.status === "done") await downloadFromApi(`${API_URL}/exports/jobs/${state.id}/download`, state.fileName);
    } catch (e: any) {
      toast({ title: "Package export failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileDown className="h-5 w-5 text-blue-600" /> Export Documents</DialogTitle>
          <DialogDescription>{target.label} - every document includes the logo and institution details from Settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Format</p>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormat(key)}
                  className={`flex items-center justify-center gap-2 rounded-md border-2 py-2 text-sm font-medium transition-colors ${format === key ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y rounded-md border">
            {docs.map((d) => (
              <li key={d.key} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm">{d.title}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busy !== null} onClick={() => downloadDoc(d.key, d.title)}>
                  {busy === d.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                  Download
                </Button>
              </li>
            ))}
            {docs.length === 0 && <li className="px-3 py-4 text-sm text-slate-500 text-center">Loading...</li>}
          </ul>

          {target.kind === "plan" || target.kind === "schedule" ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-indigo-900">Download all</p>
                  <p className="text-xs text-indigo-700">
                    {target.kind === "plan" ? "Every document of this plan" : "Every document of every plan in this schedule, plus the duty summary"}, as one ZIP
                    {format === "both" ? " with Excel/ and PDF/ folders" : ""}.
                  </p>
                </div>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1" disabled={busy !== null} onClick={downloadAll}>
                  {busy === "__all__" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                  Download all
                </Button>
              </div>
              {job && (
                <div className="space-y-1">
                  <Progress value={job.status === "done" ? 100 : job.progress} className="h-2" />
                  <p className="text-[11px] text-indigo-800">{job.status === "done" ? "Done - downloading..." : `${job.progress}% - ${job.message}`}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportCenterDialog;
