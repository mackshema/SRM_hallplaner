import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { planApi, PlanVacancies, Vacancy } from "@/lib/planApi";
import FacultyPickerDialog from "@/components/FacultyPickerDialog";
import { AlertTriangle, Loader2, UserPlus, Wand2 } from "lucide-react";

/**
 * "X halls still need faculty" prompt after an assignment run (or from a plan).
 * Per hall: "Add faculty" (manual picker). Per plan: re-run auto-assign for the
 * remaining vacancies only. Nothing already assigned is changed.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  plans: PlanVacancies[];
  /** Called after vacancies changed, so the parent can reload its plan */
  onChanged?: () => void;
}

const totals = (plans: PlanVacancies[]) => {
  const halls = plans.reduce((n, p) => n + p.vacancies.length, 0);
  const seats = plans.reduce((n, p) => n + p.vacancies.reduce((m, v) => m + v.missing, 0), 0);
  return { halls, seats };
};

const VacancyDialog: React.FC<Props> = ({ open, onClose, plans: initial, onChanged }) => {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanVacancies[]>(initial);
  const [filling, setFilling] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ plan: PlanVacancies; hall: Vacancy } | null>(null);

  useEffect(() => { if (open) setPlans(initial); }, [open, initial]);

  const replaceVacancies = (planId: string, vacancies: Vacancy[]) =>
    setPlans((prev) => prev.map((p) => (p.planId === planId ? { ...p, vacancies } : p)));

  const autoFill = async (p: PlanVacancies) => {
    setFilling(p.planId);
    try {
      const state = await planApi.fillVacancies(p.planType, p.planId);
      replaceVacancies(p.planId, state.vacancies);
      toast({
        title: state.filled ? `Assigned ${state.filled} more invigilator${state.filled === 1 ? "" : "s"}` : "No eligible faculty found",
        description: state.message || "All halls in this plan are staffed.",
        variant: state.filled ? undefined : "destructive",
      });
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Auto-assign failed", description: e.message, variant: "destructive" });
    } finally {
      setFilling(null);
    }
  };

  const { halls, seats } = totals(plans);

  return (
    <>
      <Dialog open={open && !picker} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              {halls ? `${halls} hall${halls === 1 ? "" : "s"} still need${halls === 1 ? "s" : ""} faculty` : "All halls are staffed"}
            </DialogTitle>
            <DialogDescription>
              {halls
                ? `${seats} invigilator${seats === 1 ? " is" : "s are"} missing. The department quota stopped the auto-assignment instead of over-using one department. Add faculty by hand (the quota may be exceeded with a warning) or re-run the auto-assignment for the remaining vacancies.`
                : "Every hall now has its required invigilators."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {plans.filter((p) => p.vacancies.length).map((p) => (
              <div key={p.planId} className="rounded-lg border">
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b">
                  <span className="font-semibold text-sm">
                    {p.examDate} {p.session}
                    <Badge variant="outline" className="ml-2 text-[10px]">{p.planType === "anna" ? "Anna University" : "Internal"}</Badge>
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={filling !== null} onClick={() => autoFill(p)}>
                    {filling === p.planId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    Auto-assign remaining
                  </Button>
                </div>
                <ul className="divide-y">
                  {p.vacancies.map((v) => (
                    <li key={v.hallId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">Hall {v.hallName}</span>
                        <span className="text-slate-500"> - needs {v.missing} more ({v.assigned}/{v.required} assigned)</span>
                      </span>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setPicker({ plan: p, hall: v })}>
                        <UserPlus className="h-3.5 w-3.5" /> Add faculty
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>{halls ? "Resolve later" : "Close"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {picker && (
        <FacultyPickerDialog
          open
          onClose={() => setPicker(null)}
          planType={picker.plan.planType}
          planId={picker.plan.planId}
          hallId={picker.hall.hallId}
          hallName={picker.hall.hallName}
          onAdded={(state) => {
            replaceVacancies(picker.plan.planId, state.vacancies);
            onChanged?.();
            if (!state.vacancies.some((v) => v.hallId === picker.hall.hallId)) setPicker(null);
          }}
        />
      )}
    </>
  );
};

export default VacancyDialog;
