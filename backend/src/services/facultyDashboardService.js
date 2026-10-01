import FacultyDuty from "../models/FacultyDuty.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import Settings from "../models/Settings.js";
import AbsenteeSubmission from "../models/AbsenteeSubmission.js";
import { normalizePlan } from "./planService.js";
import { hallAbsenteeWindow } from "./absenteeService.js";
import { isPlanVisible, formatIST, examLiveStatus } from "../utils/planStatus.js";

/**
 * Duty cards for one faculty member's dashboard.
 *
 * Enforced here (not only in the UI): a duty from a plan that isn't published
 * yet, or whose publish time hasn't passed, comes back without any hall
 * details - just the date, session and when it will be available.
 */
export const getFacultyDutyCards = async (facultyId, now = new Date()) => {
  const [duties, reserves] = await Promise.all([
    FacultyDuty.find({ facultyId }).populate("hallId").lean(),
    ReserveFaculty.find({ facultyId, status: "reserve" }).lean(),
  ]);
  if (!duties.length && !reserves.length) return [];

  const slots = [...new Set([...duties, ...reserves].map((d) => `${d.examDate}___${d.examSession}`))]
    .map((k) => { const [examDate, session] = k.split("___"); return { examDate, session }; });

  const [internalDocs, annaDocs, settings] = await Promise.all([
    ExamSession.find({ $or: slots.map((s) => ({ examDate: s.examDate, examSession: s.session })) }).lean(),
    AnnaSeating.find({ $or: slots.map((s) => ({ examDate: s.examDate, session: s.session })) })
      .select("-assignments.rollNumber -assignments.subjectCode -assignments.department -assignments.row -assignments.column -assignments.benchPosition")
      .lean(),
    Settings.findOne().select("absenteeWindowMinutes").lean(),
  ]);
  const internal = internalDocs.map((d) => normalizePlan("internal", d));
  const anna = annaDocs.map((d) => normalizePlan("anna", d));

  // Which plan does a duty belong to? An Anna plan claims the halls it seats; otherwise Internal.
  const planForDuty = (examDate, session, hallId) => {
    const annaPlan = anna.find((p) => p.examDate === examDate && p.session === session &&
      (!hallId || (p.doc.assignments || []).some((a) => String(a.hallId) === String(hallId))));
    return annaPlan || internal.find((p) => p.examDate === examDate && p.session === session) ||
      anna.find((p) => p.examDate === examDate && p.session === session) || null;
  };
  const planForReserve = (r) => {
    if (r.planId) return [...internal, ...anna].find((p) => p.planId === String(r.planId)) || null;
    const list = r.examType === "Anna" ? anna : internal;
    return list.find((p) => p.examDate === r.examDate && p.session === r.examSession) || null;
  };

  const hiddenCard = (base, plan, isReserve) => ({
    ...base,
    isReserve,
    isScheduled: true,
    isPublished: false,
    publish_at: plan.publish_at,
    publish_at_formatted: formatIST(plan.publish_at),
    message: `${isReserve ? "Reserve duty" : "Duty"} details will be available on ${formatIST(plan.publish_at)}`,
  });

  const cards = [];
  for (const duty of duties) {
    const hallId = duty.hallId?._id ? String(duty.hallId._id) : null;
    const plan = planForDuty(duty.examDate, duty.examSession, hallId);
    if (!plan) continue;
    const base = {
      planType: plan.planType,
      planId: plan.planId,
      examDate: duty.examDate,
      examSession: duty.examSession,
      examTime: duty.examTime || plan.examTime,
    };
    if (!isPlanVisible(plan.doc, now)) {
      if (plan.status === "SCHEDULED" && plan.publish_at) cards.push(hiddenCard(base, plan, false));
      continue; // not published: nothing at all
    }

    const window = await hallAbsenteeWindow(plan, hallId, facultyId, settings, now);
    const submission = await AbsenteeSubmission.findOne({ planType: plan.planType, planId: plan.planId, hallId })
      .select("absentees submittedAt submittedByName").lean();
    cards.push({
      ...base,
      hallId,
      hallName: duty.hallId?.name || "N/A",
      floor: duty.hallId?.floor || "",
      isReserve: false,
      isScheduled: false,
      isPublished: true,
      startAt: plan.start_at,
      endAt: plan.end_at,
      liveStatus: examLiveStatus(plan, now),
      absentee: window ? {
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        isOpen: window.isOpen,
        isClosed: window.isClosed,
        extended: window.extended,
        submitted: !!submission,
        submittedAt: submission?.submittedAt || null,
        absenteeCount: submission?.absentees?.length || 0,
      } : null,
    });
  }

  for (const reserve of reserves) {
    const plan = planForReserve(reserve);
    if (!plan) continue;
    const base = {
      planType: plan.planType,
      planId: plan.planId,
      examDate: reserve.examDate,
      examSession: reserve.examSession,
      examTime: plan.examTime,
    };
    if (!isPlanVisible(plan.doc, now)) {
      if (plan.status === "SCHEDULED" && plan.publish_at) cards.push(hiddenCard(base, plan, true));
      continue;
    }
    cards.push({
      ...base,
      hallName: "Reserve Invigilator",
      floor: "Examination Control Cell",
      isReserve: true,
      isScheduled: false,
      isPublished: true,
      startAt: plan.start_at,
      endAt: plan.end_at,
      // Reserves can see the exam status, but upload absentees only once converted to a hall duty
      liveStatus: examLiveStatus(plan, now),
      absentee: null,
    });
  }

  return cards.sort((a, b) => new Date(b.examDate) - new Date(a.examDate) ||
    (a.examSession === b.examSession ? 0 : a.examSession === "FN" ? -1 : 1));
};
