import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { planApi, PlanType, ExamScheduleItem, PlanVacancies, isLockedStatus, formatIST } from "@/lib/planApi";
import PlanStatusBadge from "@/components/PlanStatusBadge";
import { PublishSchedulerDialog, PublishDialogResult, publishRequestBody } from "@/components/PublishSchedulerDialog";
import VacancyDialog from "@/components/VacancyDialog";
import ExportCenterDialog from "@/components/ExportCenterDialog";
import AbsenteeReportDialog from "@/components/AbsenteeReportDialog";
import { AlertTriangle, CheckCircle2, ClipboardList, FileDown, Lock, Unlock } from "lucide-react";

/**
 * Status + actions row shared by the Internal and Anna University planners:
 * finalize / publish (with timing) / reschedule / cancel / unpublish / unlock,
 * exam schedule membership, staffing vacancies, exports and absentee report.
 */

export interface PlanSummary {
  _id: string;
  examDate: string;
  session: string;
  status?: string;
  isPublished?: boolean;
  publish_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  absentee_window_minutes?: number | null;
  examScheduleId?: string | null;
}

interface Props {
  planType: PlanType;
  plan: PlanSummary;
  /** Called with the updated plan document after any change */
  onPlanUpdated: (plan: any) => void;
  onFinalize: () => Promise<void> | void;
  onUnlock: () => Promise<void> | void;
  /** Bump to re-check vacancies (e.g. after faculty changes elsewhere) */
  refreshKey?: number;
}

const NONE = "__none__";

const PlanActionsBar: React.FC<Props> = ({ planType, plan, onPlanUpdated, onFinalize, onUnlock, refreshKey = 0 }) => {
  const { toast } = useToast();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [defaultWindow, setDefaultWindow] = useState(120);
  const [vacancyPlans, setVacancyPlans] = useState<PlanVacancies[]>([]);
  const [vacancyOpen, setVacancyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const status = plan.status || "DRAFT";
  const locked = isLockedStatus(status);
  const label = `${plan.examDate} ${plan.session}${planType === "anna" ? " (Anna University)" : ""}`;

  useEffect(() => {
    planApi.schedules().then(setSchedules).catch(() => {});
    planApi.settings().then((s) => setDefaultWindow(s.absenteeWindowMinutes ?? 120)).catch(() => {});
  }, []);

  const loadVacancies = useCallback(async () => {
    try {
      const state = await planApi.vacancies(planType, plan._id);
      setVacancyPlans([{ planType, planId: plan._id, examDate: plan.examDate, session: plan.session, vacancies: state.vacancies }]);
    } catch {
      setVacancyPlans([]);
    }
  }, [planType, plan._id, plan.examDate, plan.session]);

  useEffect(() => { loadVacancies(); }, [loadVacancies, refreshKey, status]);

  const run = async (fn: () => Promise<any>, success: string) => {
    try {
      const updated = await fn();
      if (updated && updated._id) onPlanUpdated(updated);
      toast({ title: success });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handlePublish = async (result: PublishDialogResult) => {
    setPublishing(true);
    try {
      const updated = await planApi.publish(planType, plan._id, publishRequestBody(result));
      onPlanUpdated(updated);
      setPublishOpen(false);
      toast({
        title: result.publishNow ? "Published" : "Scheduled",
        description: result.publishNow ? "Plan is now live on the student and faculty dashboards." : `Plan will go live on ${formatIST(result.publishAt)}.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const changeSchedule = (value: string) =>
    run(() => planApi.setSchedule(planType, plan._id, value === NONE ? null : value), "Exam schedule updated");

  const missing = vacancyPlans.reduce((n, p) => n + p.vacancies.length, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-blue-50/50 p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-wrap gap-6 items-center">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1.5 tracking-wider">Plan Status</span>
            <div className="flex items-center gap-2">
              {locked ? <Lock className="h-4 w-4 text-green-600" /> : <Unlock className="h-4 w-4 text-yellow-600" />}
              <PlanStatusBadge status={status} publishAt={plan.publish_at} isPublished={plan.isPublished} />
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1.5 tracking-wider">Exam Timing</span>
            <span className="text-sm text-slate-700">
              {plan.start_at && plan.end_at
                ? `${formatIST(plan.start_at).split(", ").pop()} - ${formatIST(plan.end_at).split(", ").pop()}`
                : <span className="text-slate-400 italic">Not set</span>}
            </span>
          </div>
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase block mb-1.5 tracking-wider">Exam Schedule</span>
            <Select value={plan.examScheduleId || NONE} onValueChange={changeSchedule}>
              <SelectTrigger className="h-8 w-[200px] bg-white text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not assigned</SelectItem>
                {schedules.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}{s.academicYear ? ` (${s.academicYear})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!locked ? (
            <Button className="bg-green-600 hover:bg-green-700 text-white shadow-sm" onClick={() => onFinalize()}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Finalize Plan
            </Button>
          ) : (
            <>
              {status !== "PUBLISHED" && !(status === "FINAL" && plan.isPublished) && (
                <Button className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => setPublishOpen(true)}>
                  {status === "SCHEDULED" ? "Reschedule" : "Publish to Dashboards"}
                </Button>
              )}
              {status === "SCHEDULED" && (
                <Button variant="outline" className="border-violet-600 text-violet-700 hover:bg-violet-50"
                  onClick={() => run(() => planApi.cancelSchedule(planType, plan._id), "Schedule cancelled - plan is Finalized")}>
                  Cancel Schedule
                </Button>
              )}
              {(status === "PUBLISHED" || (status === "FINAL" && plan.isPublished)) && (
                <Button variant="outline" className="border-red-600 text-red-700 hover:bg-red-50"
                  onClick={() => run(() => planApi.unpublish(planType, plan._id), "Unpublished - hidden from dashboards")}>
                  Unpublish
                </Button>
              )}
              <Button variant="outline" className="border-yellow-600 text-yellow-700 hover:bg-yellow-50" onClick={() => onUnlock()}>
                Unlock / Edit Plan
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setExportOpen(true)}><FileDown className="h-4 w-4 mr-1" /> Export</Button>
          {locked && <Button variant="outline" onClick={() => setReportOpen(true)}><ClipboardList className="h-4 w-4 mr-1" /> Absentee Report</Button>}
        </div>
      </div>

      {missing > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-sm text-orange-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {missing} hall{missing === 1 ? "" : "s"} still need{missing === 1 ? "s" : ""} faculty.
          </p>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => setVacancyOpen(true)}>Resolve</Button>
        </div>
      )}

      <PublishSchedulerDialog
        isOpen={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        isLoading={publishing}
        planLabel={label}
        currentPublishAt={status === "SCHEDULED" ? plan.publish_at ?? null : null}
        examDate={plan.examDate}
        session={plan.session}
        currentStartAt={plan.start_at}
        currentEndAt={plan.end_at}
        currentWindowMinutes={plan.absentee_window_minutes}
        defaultWindowMinutes={defaultWindow}
      />
      <VacancyDialog open={vacancyOpen} onClose={() => { setVacancyOpen(false); loadVacancies(); }} plans={vacancyPlans} onChanged={loadVacancies} />
      <ExportCenterDialog open={exportOpen} onClose={() => setExportOpen(false)} target={{ kind: "plan", planType, planId: plan._id, label }} />
      {reportOpen && <AbsenteeReportDialog open onClose={() => setReportOpen(false)} planType={planType} planId={plan._id} label={label} />}
    </div>
  );
};

export default PlanActionsBar;
