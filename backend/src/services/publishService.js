import { planModel, loadPlan } from "./planService.js";
import { onPlanChanged } from "./planLifecycle.js";
import { istDateTime, formatIST } from "../utils/planStatus.js";

/**
 * Publish / schedule / cancel / unpublish / exam timing for both plan types.
 * Status flow: DRAFT -> FINAL -> SCHEDULED -> PUBLISHED. Only a finalized plan
 * can be published or scheduled.
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Sends an HttpError as JSON, anything else as a 500. */
export const sendError = (res, err, fallback = "Request failed") => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
};

const PAST_GRACE_MS = 60 * 1000; // clock skew between browser and server

const parseDate = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new HttpError(400, `Invalid ${field}.`);
  return d;
};

/**
 * Reads timing from a request body. Accepts ISO timestamps (start_at, end_at)
 * or wall-clock IST times (startTime, endTime as "HH:MM") on the plan's exam date.
 * Returns only the fields that were sent.
 */
export const parseTimingInput = (body, plan) => {
  const timing = {};
  if (body.startTime !== undefined) timing.start_at = body.startTime ? istDateTime(plan.examDate, body.startTime) : null;
  else if (body.start_at !== undefined) timing.start_at = parseDate(body.start_at, "exam start time");
  if (body.endTime !== undefined) timing.end_at = body.endTime ? istDateTime(plan.examDate, body.endTime) : null;
  else if (body.end_at !== undefined) timing.end_at = parseDate(body.end_at, "exam end time");
  if (body.startTime && !timing.start_at) throw new HttpError(400, "Invalid exam start time.");
  if (body.endTime && !timing.end_at) throw new HttpError(400, "Invalid exam end time.");

  if (body.absentee_window_minutes !== undefined) {
    const raw = body.absentee_window_minutes;
    if (raw === null || raw === "") timing.absentee_window_minutes = null;
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 24 * 60) {
        throw new HttpError(400, "Absentee upload window must be between 1 and 1440 minutes.");
      }
      timing.absentee_window_minutes = Math.round(n);
    }
  }
  return timing;
};

const validateTiming = ({ start_at, end_at }, publishTime) => {
  if (!start_at && !end_at) return;
  if (!start_at || !end_at) throw new HttpError(400, "Both exam start and end time are required.");
  if (end_at <= start_at) throw new HttpError(400, "Exam end time must be after the start time.");
  if (publishTime && publishTime >= start_at) {
    throw new HttpError(400, `Publish time (${formatIST(publishTime)}) must be before the exam starts (${formatIST(start_at)}).`);
  }
};

const currentTiming = (plan) => ({
  start_at: plan.start_at ? new Date(plan.start_at) : null,
  end_at: plan.end_at ? new Date(plan.end_at) : null,
});

const requirePlan = async (planType, planId) => {
  const plan = await loadPlan(planType, planId);
  if (!plan) throw new HttpError(404, "Seating plan not found.");
  return plan;
};

const save = async (plan, update, reason) => {
  const doc = await planModel(plan.planType).findByIdAndUpdate(plan.planId, { $set: update }, { new: true });
  await onPlanChanged(plan.planType, plan.planId, { reason });
  return doc;
};

/**
 * Publish now (publish_at null/omitted) or schedule for a future time, with
 * optional exam timing in the same call.
 */
export const publishPlan = async (planType, planId, body = {}, now = new Date()) => {
  const plan = await requirePlan(planType, planId);

  if (plan.status === "DRAFT") throw new HttpError(400, "Only finalized plans can be published or scheduled. Finalize the plan first.");
  if (plan.status === "PUBLISHED") throw new HttpError(400, "This plan is already live. Unpublish it first to reschedule.");
  if (plan.status === "SCHEDULED" && plan.publish_at && new Date(plan.publish_at) <= now) {
    throw new HttpError(400, "This plan has already gone live and can no longer be rescheduled.");
  }

  const publishAt = parseDate(body.publish_at ?? null, "publish time");
  if (publishAt && publishAt.getTime() < now.getTime() - PAST_GRACE_MS) {
    throw new HttpError(400, "Publish time can't be in the past.");
  }
  const scheduled = publishAt && publishAt > now;

  const timing = parseTimingInput(body, plan);
  const merged = { ...currentTiming(plan), ...timing };
  validateTiming(merged, scheduled ? publishAt : now);

  return save(plan, {
    ...timing,
    status: scheduled ? "SCHEDULED" : "PUBLISHED",
    isPublished: !scheduled,
    publish_at: scheduled ? publishAt : now,
  }, scheduled ? "plan scheduled" : "plan published");
};

/** Back to Finalized, only while the scheduled time hasn't passed. */
export const cancelSchedule = async (planType, planId, now = new Date()) => {
  const plan = await requirePlan(planType, planId);
  if (plan.status !== "SCHEDULED") throw new HttpError(400, "Only scheduled plans can be cancelled.");
  if (plan.publish_at && new Date(plan.publish_at) <= now) {
    throw new HttpError(400, "This plan has already gone live; unpublish it instead.");
  }
  return save(plan, { status: "FINAL", isPublished: false, publish_at: null }, "schedule cancelled");
};

/** Hides a live plan again (back to Finalized). */
export const unpublishPlan = async (planType, planId) => {
  const plan = await requirePlan(planType, planId);
  if (!["PUBLISHED", "SCHEDULED"].includes(plan.status) && !plan.isPublished) {
    throw new HttpError(400, "This plan is not published.");
  }
  return save(plan, { status: "FINAL", isPublished: false, publish_at: null }, "plan unpublished");
};

/** Exam timing / absentee window edits outside the publish dialog (plan settings). */
export const setPlanTiming = async (planType, planId, body = {}) => {
  const plan = await requirePlan(planType, planId);
  const timing = parseTimingInput(body, plan);
  if (!Object.keys(timing).length) throw new HttpError(400, "Nothing to update.");
  const merged = { ...currentTiming(plan), ...timing };
  const publishTime = plan.status === "SCHEDULED" && plan.publish_at ? new Date(plan.publish_at) : null;
  validateTiming(merged, publishTime);
  const doc = await planModel(planType).findByIdAndUpdate(plan.planId, { $set: timing }, { new: true });
  return doc;
};
