/**
 * Plan lifecycle rules shared by Internal (ExamSession) and Anna University
 * (AnnaSeating) plans. Every "is this plan locked / visible / live?" question
 * goes through here so the modules can't drift apart.
 *
 *   DRAFT -> FINAL -> SCHEDULED -> PUBLISHED
 *
 * FINAL, SCHEDULED and PUBLISHED are all "locked": seating and duties are fixed.
 */

export const LOCKED_STATUSES = ["FINAL", "SCHEDULED", "PUBLISHED"];

export const IST_TIMEZONE = "Asia/Kolkata";

/** Default absentee upload window when neither the plan nor Settings set one. */
export const DEFAULT_ABSENTEE_WINDOW_MINUTES = 120;

export const isLocked = (status) => LOCKED_STATUSES.includes(status);

/**
 * Students and faculty may see a plan only when it is published and its
 * publish time has passed. Legacy plans published before scheduling existed
 * have isPublished=true and no publish_at, and stay visible.
 */
export const isPlanVisible = (plan, now = new Date()) => {
  if (!plan) return false;
  const published =
    plan.status === "PUBLISHED" ||
    plan.status === "SCHEDULED" ||
    (plan.isPublished === true && isLocked(plan.status));
  if (!published) return false;
  if (!plan.publish_at) return plan.status !== "SCHEDULED";
  return now >= new Date(plan.publish_at);
};

/** Mongo filter matching the same plans as isPlanVisible (for plan collections). */
export const visiblePlanFilter = (now = new Date()) => ({
  $or: [
    { status: { $in: ["PUBLISHED", "SCHEDULED"] }, publish_at: { $ne: null, $lte: now } },
    { status: "PUBLISHED", publish_at: null },
    { status: "FINAL", isPublished: true, $or: [{ publish_at: null }, { publish_at: { $lte: now } }] },
  ],
});

export const formatIST = (date) =>
  date
    ? new Date(date).toLocaleString("en-IN", {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";

/**
 * Converts an exam date (YYYY-MM-DD) and a wall-clock time in IST (HH:MM) to a
 * UTC Date. IST has no daylight saving, so a fixed +05:30 offset is exact.
 */
export const istDateTime = (examDate, hhmm) => {
  if (!examDate || !hhmm) return null;
  const d = new Date(`${examDate}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Exam timing status computed at read time: null when the plan has no timing yet
 * (existing plans keep working without live status), otherwise
 * UPCOMING / LIVE / COMPLETED.
 */
export const examLiveStatus = (plan, now = new Date()) => {
  if (!plan?.start_at || !plan?.end_at) return null;
  const start = new Date(plan.start_at);
  const end = new Date(plan.end_at);
  if (now < start) return "UPCOMING";
  if (now < end) return "LIVE";
  return "COMPLETED";
};

/**
 * Absentee upload window for one hall/faculty. Opens at start_at and closes
 * windowMinutes later (plan override, else the Settings default), unless an
 * admin extension for that hall or faculty pushes the close time out.
 *
 * @param extensions [{ extendedUntil: Date }] already filtered to this hall/faculty
 */
export const absenteeWindow = (plan, settings, extensions = [], now = new Date()) => {
  if (!plan?.start_at) return null;
  const minutes =
    plan.absentee_window_minutes ??
    settings?.absenteeWindowMinutes ??
    DEFAULT_ABSENTEE_WINDOW_MINUTES;
  const opensAt = new Date(plan.start_at);
  let closesAt = new Date(opensAt.getTime() + minutes * 60 * 1000);
  for (const ext of extensions) {
    const until = new Date(ext.extendedUntil);
    if (until > closesAt) closesAt = until;
  }
  return {
    opensAt,
    closesAt,
    minutes,
    isOpen: now >= opensAt && now <= closesAt,
    isClosed: now > closesAt,
    extended: extensions.length > 0,
  };
};
