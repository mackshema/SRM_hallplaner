import mongoose from "mongoose";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import SeatAssignment from "../models/SeatAssignment.js";
import FacultyDuty from "../models/FacultyDuty.js";
import User from "../models/User.js";
import { isLocked } from "../utils/planStatus.js";

/**
 * One adapter over the two plan collections so features (reserves, duty
 * records, absentees, exports, vacancies) work the same for both:
 *   planType 'internal' -> ExamSession (+ SeatAssignment rows)
 *   planType 'anna'     -> AnnaSeating (assignments embedded)
 */

export const PLAN_TYPES = ["internal", "anna"];

export const planModel = (planType) => (planType === "anna" ? AnnaSeating : ExamSession);

/** Anna University slot start times (same as annaUniversityController.resolveExamTime). */
export const annaExamTime = (session) => (session === "AN" ? "02:00 PM" : "09:30 AM");

export const isValidPlanType = (planType) => PLAN_TYPES.includes(planType);

/** Normalized, read-only view of a plan document. */
export const normalizePlan = (planType, doc) => {
  if (!doc) return null;
  const session = planType === "anna" ? doc.session : doc.examSession;
  return {
    planType,
    planId: String(doc._id),
    doc,
    examDate: doc.examDate,
    session,
    examTime: planType === "anna" ? annaExamTime(doc.session) : doc.examTime,
    status: doc.status || "DRAFT",
    isPublished: !!doc.isPublished,
    publish_at: doc.publish_at || null,
    start_at: doc.start_at || null,
    end_at: doc.end_at || null,
    absentee_window_minutes: doc.absentee_window_minutes ?? null,
    examScheduleId: doc.examScheduleId ? String(doc.examScheduleId) : null,
    facultyAssignments: doc.facultyAssignments || [],
    label: `${doc.examDate} ${session}${planType === "anna" ? " (Anna University)" : ""}`,
  };
};

export const loadPlan = async (planType, planId) => {
  if (!isValidPlanType(planType) || !mongoose.isValidObjectId(planId)) return null;
  const doc = await planModel(planType).findById(planId);
  return normalizePlan(planType, doc);
};

/** Plan(s) occupying a date/session slot, both modules. */
export const plansForSlot = async (examDate, session) => {
  const [internal, anna] = await Promise.all([
    ExamSession.find({ examDate, examSession: session }),
    AnnaSeating.find({ examDate, session }),
  ]);
  return [
    ...internal.map((d) => normalizePlan("internal", d)),
    ...anna.map((d) => normalizePlan("anna", d)),
  ];
};

/**
 * Halls that have students in the plan: [{ hallId, hallName, studentCount, subjects }]
 */
export const planHallsWithStudents = async (plan) => {
  if (plan.planType === "anna") {
    const byHall = new Map();
    for (const a of plan.doc.assignments || []) {
      if (!a.hallId) continue;
      const key = String(a.hallId);
      if (!byHall.has(key)) byHall.set(key, { hallId: key, hallName: a.hallName || "", studentCount: 0, subjects: new Set() });
      const h = byHall.get(key);
      h.studentCount++;
      if (a.subjectCode) h.subjects.add(a.subjectCode);
    }
    return [...byHall.values()].map((h) => ({ ...h, subjects: [...h.subjects] }));
  }
  const rows = await SeatAssignment.aggregate([
    { $match: { examSessionId: new mongoose.Types.ObjectId(plan.planId) } },
    { $group: { _id: "$hallId", studentCount: { $sum: 1 }, subjects: { $addToSet: "$subjectCode" } } },
    { $lookup: { from: "halls", localField: "_id", foreignField: "_id", as: "hall" } },
  ]);
  return rows.map((r) => ({
    hallId: String(r._id),
    hallName: r.hall?.[0]?.name || "",
    studentCount: r.studentCount,
    subjects: (r.subjects || []).filter(Boolean),
  }));
};

/**
 * Students seated in one hall of the plan, in seat order:
 * [{ assignmentId, rollNumber, name, department, subjectCode, row, column, benchPosition, isExtraBench, isAbsent }]
 */
export const planHallStudents = async (plan, hallId) => {
  let rows;
  if (plan.planType === "anna") {
    rows = (plan.doc.assignments || [])
      .filter((a) => String(a.hallId) === String(hallId))
      .map((a) => ({
        assignmentId: String(a._id),
        rollNumber: a.rollNumber,
        name: "",
        department: a.department || "",
        subjectCode: a.subjectCode || "",
        row: a.row,
        column: a.column,
        benchPosition: a.benchPosition,
        isExtraBench: false,
        isAbsent: !!a.isAbsent,
      }));
    const users = await User.find({ role: "student", username: { $in: rows.map((r) => r.rollNumber) } })
      .select("username name").lean();
    const names = new Map(users.map((u) => [u.username, u.name]));
    rows.forEach((r) => { r.name = names.get(r.rollNumber) || ""; });
  } else {
    const seats = await SeatAssignment.find({ examSessionId: plan.planId, hallId }).lean();
    rows = seats.map((s) => ({
      assignmentId: String(s._id),
      rollNumber: s.studentRollNumber,
      name: s.studentName || "",
      department: s.departmentId || "",
      subjectCode: s.subjectCode || "",
      row: s.row,
      column: s.column,
      benchPosition: s.benchPosition,
      isExtraBench: !!s.isExtraBench,
      isAbsent: !!s.isAbsent,
    }));
  }
  return rows.sort((a, b) =>
    (a.isExtraBench - b.isExtraBench) || a.row - b.row || a.column - b.column || a.benchPosition - b.benchPosition);
};

/**
 * Invigilators per hall: Map(hallId -> facultyId[]).
 * Locked plans read the saved FacultyDuty records (they include replacements);
 * drafts read the plan's own facultyAssignments.
 */
export const planInvigilators = async (plan) => {
  const map = new Map();
  if (isLocked(plan.status)) {
    const halls = await planHallsWithStudents(plan);
    const hallIds = new Set(halls.map((h) => h.hallId));
    const duties = await FacultyDuty.find({ examDate: plan.examDate, examSession: plan.session }).lean();
    for (const d of duties) {
      const key = String(d.hallId);
      // Internal and Anna plans could share a slot; keep only this plan's halls
      if (hallIds.size && !hallIds.has(key)) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(String(d.facultyId));
    }
  } else {
    for (const fa of plan.facultyAssignments) {
      map.set(String(fa.hallId), (fa.facultyIds || []).map(String));
    }
  }
  return map;
};

/**
 * Deletes the FacultyDuty rows of one plan (its halls in its slot). Falls back
 * to the whole slot when the plan has no seated halls left.
 */
export const deletePlanDuties = async (plan) => {
  const halls = await planHallsWithStudents(plan);
  const filter = { examDate: plan.examDate, examSession: plan.session };
  if (halls.length) filter.hallId = { $in: halls.map((h) => h.hallId) };
  await FacultyDuty.deleteMany(filter);
};

/** Mongo query for the reserves that belong to a plan (older rows may lack planId). */
export const reserveQueryForPlan = (plan, statuses = ["reserve", "converted"]) => ({
  examDate: plan.examDate,
  examSession: plan.session,
  status: { $in: statuses },
  $or: [
    { planId: new mongoose.Types.ObjectId(plan.planId) },
    { planId: null, examType: plan.planType === "anna" ? "Anna" : "Internal" },
  ],
});
