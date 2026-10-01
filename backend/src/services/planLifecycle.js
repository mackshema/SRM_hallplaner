import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import DutyRecord from "../models/DutyRecord.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import AbsenteeSubmission from "../models/AbsenteeSubmission.js";
import AbsenteeWindowExtension from "../models/AbsenteeWindowExtension.js";
import { syncDutyRecordsForPlan } from "./dutyRecordService.js";
import { refreshScheduleState } from "./dutySummaryService.js";

/**
 * Call after anything that changes a plan's status, invigilators, reserves or
 * schedule: rebuilds its duty records, then re-checks its exam schedule
 * (completion + duty summary). Pass previousScheduleId when a plan moved
 * between schedules so the old one is refreshed too.
 *
 * Failures are logged, never thrown: the plan change itself already succeeded.
 */
export const onPlanChanged = async (planType, planId, { reason = "plan changed", previousScheduleId = null } = {}) => {
  try {
    const plan = await syncDutyRecordsForPlan(planType, planId);
    const scheduleIds = new Set([plan?.examScheduleId, previousScheduleId].filter(Boolean).map(String));
    for (const id of scheduleIds) await refreshScheduleState(id, reason);
  } catch (err) {
    console.error(`[LIFECYCLE] Sync failed for ${planType} plan ${planId}:`, err);
  }
};

/**
 * Cleanup for plans removed in bulk (timetable re-upload, regeneration):
 * their reserves, duty records and absentee data go too, and their exam
 * schedules are re-checked. Call with the plan docs (need _id, examDate,
 * session/examSession, examScheduleId) before or after deleting them.
 */
export const afterPlansDeleted = async (planType, docs) => {
  if (!docs.length) return;
  const ids = docs.map((d) => d._id);
  const examType = planType === "anna" ? "Anna" : "Internal";
  await Promise.all([
    DutyRecord.deleteMany({ planType, planId: { $in: ids } }),
    AbsenteeSubmission.deleteMany({ planType, planId: { $in: ids } }),
    AbsenteeWindowExtension.deleteMany({ planType, planId: { $in: ids } }),
    ReserveFaculty.deleteMany({
      $or: [
        { planId: { $in: ids } },
        ...docs.map((d) => ({ planId: null, examType, examDate: d.examDate, examSession: d.session ?? d.examSession })),
      ],
    }),
  ]);
  const scheduleIds = new Set(docs.map((d) => d.examScheduleId).filter(Boolean).map(String));
  for (const id of scheduleIds) {
    await refreshScheduleState(id, "plans deleted").catch((err) => console.error("[LIFECYCLE]", err));
  }
};

/** Fire-and-forget variant for request handlers that shouldn't wait. */
export const onPlanChangedAsync = (planType, planId, opts) => {
  setImmediate(() => onPlanChanged(planType, planId, opts));
};

/**
 * Flips SCHEDULED plans whose publish time has passed to PUBLISHED and runs the
 * lifecycle hook for each. Visibility never depends on this running (reads
 * check publish_at <= now themselves); it keeps statuses, duty records and
 * schedule completion current.
 * @returns number of plans promoted
 */
export const autoPromoteDuePlans = async (now = new Date()) => {
  let promoted = 0;
  for (const [planType, Model] of [["internal", ExamSession], ["anna", AnnaSeating]]) {
    const due = await Model.find({ status: "SCHEDULED", publish_at: { $ne: null, $lte: now } }).select("_id").lean();
    for (const { _id } of due) {
      const res = await Model.updateOne({ _id, status: "SCHEDULED" }, { $set: { status: "PUBLISHED", isPublished: true } });
      if (res.modifiedCount) {
        promoted++;
        await onPlanChanged(planType, _id, { reason: "scheduled publish time reached" });
      }
    }
  }
  return promoted;
};

let timer = null;

/** Lightweight scheduler: checks for due plans every minute. */
export const startPublishScheduler = (intervalMs = 60 * 1000) => {
  if (timer) return;
  const tick = () => autoPromoteDuePlans().catch((err) => console.error("[SCHEDULER] Auto-publish failed:", err));
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
};
