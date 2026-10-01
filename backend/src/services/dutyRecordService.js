import mongoose from "mongoose";
import DutyRecord from "../models/DutyRecord.js";
import ExamSchedule from "../models/ExamSchedule.js";
import FacultyDuty from "../models/FacultyDuty.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import { isLocked } from "../utils/planStatus.js";
import { loadPlan, planHallsWithStudents, reserveQueryForPlan } from "./planService.js";

/**
 * Rebuilds the DutyRecord rows of one plan from its operational records:
 * FacultyDuty (invigilators, incl. converted reserves) and ReserveFaculty.
 * Drafts have no duty rows. Idempotent - safe to call after any change.
 *
 * @returns the normalized plan, or null if it no longer exists
 */
export const syncDutyRecordsForPlan = async (planType, planId) => {
  const plan = await loadPlan(planType, planId);
  await DutyRecord.deleteMany({ planType, planId: new mongoose.Types.ObjectId(String(planId)) });
  if (!plan || !isLocked(plan.status)) return plan;

  const schedule = plan.examScheduleId ? await ExamSchedule.findById(plan.examScheduleId).lean() : null;
  const halls = await planHallsWithStudents(plan);
  const hallInfo = new Map(halls.map((h) => [h.hallId, h]));

  const [duties, reserves] = await Promise.all([
    FacultyDuty.find({ examDate: plan.examDate, examSession: plan.session }).populate("hallId", "name").lean(),
    ReserveFaculty.find(reserveQueryForPlan(plan)).populate("convertedToHallId", "name").lean(),
  ]);
  const convertedReserveIds = new Set(
    reserves.filter((r) => r.status === "converted").map((r) => String(r.facultyId))
  );

  const base = {
    examScheduleId: schedule?._id || null,
    examScheduleName: schedule?.name || "",
    category: schedule?.category || "",
    academicYear: schedule?.academicYear || "",
    semester: schedule?.semester || "",
    planType,
    planId: plan.planId,
    planStatus: plan.status,
    publish_at: plan.publish_at,
    isPublished: plan.isPublished,
    examDate: plan.examDate,
    session: plan.session,
    examTime: plan.examTime,
  };

  const rows = [];
  for (const d of duties) {
    const hallId = String(d.hallId?._id || d.hallId);
    // A slot can hold both an Internal and an Anna plan; keep this plan's halls only
    if (hallInfo.size && !hallInfo.has(hallId)) continue;
    rows.push({
      ...base,
      facultyId: d.facultyId,
      examTime: d.examTime || plan.examTime,
      hallId,
      hallName: d.hallId?.name || hallInfo.get(hallId)?.hallName || "",
      subjects: hallInfo.get(hallId)?.subjects || [],
      role: "invigilator",
      convertedFromReserve: convertedReserveIds.has(String(d.facultyId)),
    });
  }
  for (const r of reserves) {
    rows.push({
      ...base,
      facultyId: r.facultyId,
      hallId: null,
      hallName: "Reserve",
      role: "reserve",
      reserveStatus: r.status,
      convertedHallName: r.convertedToHallId?.name || "",
    });
  }
  if (rows.length) await DutyRecord.insertMany(rows);
  return plan;
};
