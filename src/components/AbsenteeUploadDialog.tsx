import React, { useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatIST } from "@/lib/planApi";
import { Loader2, Lock, Search } from "lucide-react";

/**
 * Invigilator's absentee form for their own hall: the student list with a
 * checkbox per student. Editable while the upload window is open (the server
 * refuses anything else).
 */

interface Student { rollNumber: string; name: string; department: string; seat: string; isAbsent: boolean }
interface HallData {
  hall: { _id: string; name: string };
  plan: { examDate: string; session: string };
  window: { opensAt: string; closesAt: string; isOpen: boolean } | null;
  canEdit: boolean;
  lockedReason: string | null;
  students: Student[];
  submission: { absentees: string[]; submittedAt: string; submittedByName: string; edits: number } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  planType: string;
  planId: string;
  hallId: string;
  onSubmitted?: () => void;
}

const AbsenteeUploadDialog: React.FC<Props> = ({ open, onClose, planType, planId, hallId, onSubmitted }) => {
  const { toast } = useToast();
  const [data, setData] = useState<HallData | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/absentees/${planType}/${planId}/${hallId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || body.message || "Failed to load the hall");
        setData(body);
        setAbsent(new Set(body.students.filter((s: Student) => s.isAbsent).map((s: Student) => s.rollNumber)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, planType, planId, hallId]);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.students || []).filter((s) => !q || s.rollNumber.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [data, search]);

  const toggle = (roll: string) =>
    setAbsent((prev) => { const next = new Set(prev); if (next.has(roll)) next.delete(roll); else next.add(roll); return next; });

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/absentees/${planType}/${planId}/${hallId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ absentees: [...absent] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.message || "Failed to submit");
      toast({ title: "Absentees submitted", description: body.message });
      onSubmitted?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const editable = !!data?.canEdit;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Upload Absentees{data ? ` - Hall ${data.hall.name}` : ""}</DialogTitle>
          <DialogDescription>
            {data ? `${data.plan.examDate} ${data.plan.session}. ` : ""}
            Tick the students who are absent, then submit. You can edit the list until the window closes
            {data?.window ? ` (${formatIST(data.window.closesAt)})` : ""}.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading students...</div>
        ) : error ? (
          <div className="py-8 text-center text-red-600 text-sm">{error}</div>
        ) : data ? (
          <>
            {!editable && (
              <p className="rounded-md bg-slate-100 border px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
                <Lock className="h-4 w-4" /> {data.lockedReason}
              </p>
            )}
            {data.submission && (
              <p className="text-xs text-slate-500">
                Last submitted by {data.submission.submittedByName} on {formatIST(data.submission.submittedAt)}
                {data.submission.edits > 1 ? ` (${data.submission.edits} saves)` : ""}.
              </p>
            )}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search register number or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
              </div>
              <span className="text-sm font-semibold text-red-700 whitespace-nowrap">{absent.size} absent / {data.students.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-md divide-y">
              {students.map((s) => (
                <label key={s.rollNumber} className={`flex items-center gap-3 px-3 py-2 ${editable ? "cursor-pointer hover:bg-slate-50" : ""} ${absent.has(s.rollNumber) ? "bg-red-50" : ""}`}>
                  <Checkbox checked={absent.has(s.rollNumber)} disabled={!editable} onCheckedChange={() => toggle(s.rollNumber)} />
                  <span className="font-mono text-sm w-36">{s.rollNumber}</span>
                  <span className="text-sm flex-1">{s.name || "-"}</span>
                  <span className="text-xs text-slate-500">{s.department}</span>
                  <span className="text-[11px] text-slate-400 w-24 text-right">{s.seat}</span>
                </label>
              ))}
            </div>
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {editable && (
            <Button onClick={submit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {data?.submission ? "Update Absentees" : "Submit Absentees"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AbsenteeUploadDialog;
