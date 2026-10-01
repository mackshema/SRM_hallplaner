import FacultyDuty from "../models/FacultyDuty.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import Hall from "../models/Hall.js";
import { isLocked } from "../utils/planStatus.js";
import { previousSession, dutiesFromAssignments } from "../utils/facultyDuties.js";

/**
 * Who is busy in a date/session slot, and why. One place for the
 * "no faculty in two places at once" rule used by auto-assignment, manual
 * hall picks, and reserve selection (both directions: invigilator <-> reserve).
 */

/** Total saved duties per faculty (fairness: fewer duties are picked first). */
export const totalDutyCounts = async () => {
  const rows = await FacultyDuty.aggregate([{ $group: { _id: "$facultyId", n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
};

/**
 * Soft duty rules for a slot, same as generation: nobody who invigilated the
 * session right before (no continuous duty) and at most 4 duties in 7 days.
 * Counts saved duties plus invigilators of draft plans.
 * @returns {{ previousSessionIds: Set<string>, weeklyCount: Record<string, number> }}
 */
export const slotSoftRules = async (examDate, session) => {
  const d = new Date(examDate);
  d.setDate(d.getDate() - 7);
  const weekAgo = d.toISOString().split("T")[0];
  const [saved, internal, anna] = await Promise.all([
    FacultyDuty.find({ examDate: { $gte: weekAgo, $lte: examDate } }).select("facultyId examDate examSession").lean(),
    ExamSession.find({ examDate: { $gte: weekAgo, $lte: examDate } }).select("examDate examSession status facultyAssignments").lean(),
    AnnaSeating.find({ examDate: { $gte: weekAgo, $lte: examDate } }).select("examDate session status facultyAssignments").lean(),
  ]);
  const drafts = [
    ...internal.filter((p) => !isLocked(p.status)).flatMap((p) => dutiesFromAssignments(p.examDate, p.examSession, p.facultyAssignments)),
    ...anna.filter((p) => !isLocked(p.status)).flatMap((p) => dutiesFromAssignments(p.examDate, p.session, p.facultyAssignments)),
  ];
  const recent = [...saved, ...drafts].filter((x) => !(x.examDate === examDate && x.examSession === session));
  const prev = previousSession(examDate, session, [
    ...internal.map((p) => ({ examDate: p.examDate, session: p.examSession })),
    ...anna.map((p) => ({ examDate: p.examDate, session: p.session })),
    ...recent,
  ]);
  const previousSessionIds = new Set(
    prev ? recent.filter((x) => x.examDate === prev.examDate && x.examSession === prev.examSession).map((x) => String(x.facultyId)) : []
  );
  const weeklyCount = {};
  recent.forEach((x) => { weeklyCount[String(x.facultyId)] = (weeklyCount[String(x.facultyId)] || 0) + 1; });
  return { previousSessionIds, weeklyCount };
};

/** Faculty on standby reserve in the slot. */
export const reservedFacultyIds = async (examDate, session) => {
  const rows = await ReserveFaculty.find({ examDate, examSession: session, status: "reserve" }).select("facultyId").lean();
  return new Set(rows.map((r) => String(r.facultyId)));
};

/**
 * Map(facultyId -> reason) of everyone already committed in the slot:
 * saved hall duties, invigilators of draft plans, and reserves.
 *
 * @param {object} [opts]
 * @param {string} [opts.ignorePlanId] skip this plan's draft assignments (used when
 *   the caller checks conflicts inside that plan itself)
 */
export const slotCommitments = async (examDate, session, { ignorePlanId = null } = {}) => {
  const busy = new Map();
  const [duties, reserves, internal, anna] = await Promise.all([
    FacultyDuty.find({ examDate, examSession: session }).populate("hallId", "name").lean(),
    ReserveFaculty.find({ examDate, examSession: session, status: "reserve" }).lean(),
    ExamSession.find({ examDate, examSession: session }).select("status facultyAssignments").lean(),
    AnnaSeating.find({ examDate, session }).select("status facultyAssignments").lean(),
  ]);

  for (const d of duties) busy.set(String(d.facultyId), `Invigilating Hall ${d.hallId?.name || ""} in this session`.replace("  ", " "));

  const draftHallIds = new Set();
  const draftAssignments = [];
  for (const plan of [...internal, ...anna]) {
    if (isLocked(plan.status) || String(plan._id) === String(ignorePlanId)) continue;
    for (const fa of plan.facultyAssignments || []) {
      draftHallIds.add(String(fa.hallId));
      for (const id of fa.facultyIds || []) draftAssignments.push({ id: String(id), hallId: String(fa.hallId) });
    }
  }
  if (draftAssignments.length) {
    const halls = await Hall.find({ _id: { $in: [...draftHallIds] } }).select("name").lean();
    const names = new Map(halls.map((h) => [String(h._id), h.name]));
    for (const a of draftAssignments) {
      if (!busy.has(a.id)) busy.set(a.id, `Assigned to Hall ${names.get(a.hallId) || ""} (draft plan) in this session`);
    }
  }

  for (const r of reserves) {
    if (!busy.has(String(r.facultyId))) busy.set(String(r.facultyId), "Reserve faculty for this session");
  }
  return busy;
};
