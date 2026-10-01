import DutyRecord, { visibleDutyFilter, countsAsDuty } from "../models/DutyRecord.js";
import DutySummary from "../models/DutySummary.js";
import ExamSchedule from "../models/ExamSchedule.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import User from "../models/User.js";

/**
 * Exam schedule completeness and the saved Duty Summary.
 *
 * Rule: a schedule is Complete when it has at least one plan and every plan
 * under it has status PUBLISHED (Scheduled is not enough; the scheduler flips
 * SCHEDULED -> PUBLISHED when publish_at passes). Legacy "FINAL + isPublished"
 * plans count as published.
 */

export const isPlanPublished = (p) => p.status === "PUBLISHED" || (p.status === "FINAL" && p.isPublished === true);

export const scheduleProgress = async (scheduleId) => {
  const fields = "examDate examSession session status isPublished publish_at";
  const [internal, anna] = await Promise.all([
    ExamSession.find({ examScheduleId: scheduleId }).select(fields).lean(),
    AnnaSeating.find({ examScheduleId: scheduleId }).select(fields).lean(),
  ]);
  const plans = [
    ...internal.map((p) => ({ planType: "internal", planId: String(p._id), examDate: p.examDate, session: p.examSession, status: p.status, publish_at: p.publish_at, published: isPlanPublished(p) })),
    ...anna.map((p) => ({ planType: "anna", planId: String(p._id), examDate: p.examDate, session: p.session, status: p.status, publish_at: p.publish_at, published: isPlanPublished(p) })),
  ].sort((a, b) => `${a.examDate}${a.session === "AN" ? 1 : 0}`.localeCompare(`${b.examDate}${b.session === "AN" ? 1 : 0}`));
  const publishedPlans = plans.filter((p) => p.published).length;
  return {
    plans,
    totalPlans: plans.length,
    publishedPlans,
    isComplete: plans.length > 0 && publishedPlans === plans.length,
  };
};

/** Builds and saves the summary from the schedule's visible duty records. */
export const generateDutySummary = async (scheduleId, reason = "manual") => {
  const schedule = await ExamSchedule.findById(scheduleId).lean();
  if (!schedule) return null;
  const progress = await scheduleProgress(scheduleId);

  const records = await DutyRecord.find({ examScheduleId: scheduleId, ...visibleDutyFilter() }).lean();
  const faculty = await User.find({ _id: { $in: [...new Set(records.map((r) => String(r.facultyId)))] } })
    .select("name department designation").lean();
  const facultyById = new Map(faculty.map((f) => [String(f._id), f]));
  const person = (id) => {
    const f = facultyById.get(String(id)) || {};
    return { facultyId: id, name: f.name || "Unknown Faculty", department: f.department || "", designation: f.designation || "" };
  };

  const byFaculty = new Map();
  const reservesByFaculty = new Map();
  const bySlot = (a, b) => `${a.date}${a.session === "AN" ? 1 : 0}`.localeCompare(`${b.date}${b.session === "AN" ? 1 : 0}`);

  for (const r of records) {
    const id = String(r.facultyId);
    if (r.role === "reserve") {
      if (!reservesByFaculty.has(id)) reservesByFaculty.set(id, { ...person(r.facultyId), reserveCount: 0, convertedCount: 0, records: [] });
      const res = reservesByFaculty.get(id);
      res.reserveCount++;
      if (r.reserveStatus === "converted") res.convertedCount++;
      res.records.push({ date: r.examDate, session: r.session, status: r.reserveStatus || "reserve", convertedHallName: r.convertedHallName || "" });
    }
    if (!countsAsDuty(r)) continue;
    if (!byFaculty.has(id)) byFaculty.set(id, { ...person(r.facultyId), dutyCount: 0, invigilatorCount: 0, reserveCount: 0, duties: [] });
    const item = byFaculty.get(id);
    item.dutyCount++;
    if (r.role === "invigilator") item.invigilatorCount++;
    else item.reserveCount++;
    item.duties.push({
      date: r.examDate,
      session: r.session,
      examTime: r.examTime,
      hallName: r.hallName,
      examName: schedule.name,
      subjects: r.subjects || [],
      role: r.role,
      planType: r.planType,
      convertedFromReserve: !!r.convertedFromReserve,
    });
  }

  const facultyRows = [...byFaculty.values()]
    .map((f) => ({ ...f, duties: f.duties.sort(bySlot) }))
    .sort((a, b) => b.dutyCount - a.dutyCount || a.name.localeCompare(b.name));
  const reserveRows = [...reservesByFaculty.values()]
    .map((r) => ({ ...r, records: r.records.sort(bySlot) }))
    .sort((a, b) => b.reserveCount - a.reserveCount || a.name.localeCompare(b.name));

  return DutySummary.findOneAndUpdate(
    { examScheduleId: scheduleId },
    {
      examScheduleId: scheduleId,
      examScheduleName: schedule.name,
      category: schedule.category,
      academicYear: schedule.academicYear,
      isComplete: progress.isComplete,
      totalPlans: progress.totalPlans,
      publishedPlans: progress.publishedPlans,
      totalFacultyWithDuty: facultyRows.length,
      totalDuties: facultyRows.reduce((n, f) => n + f.dutyCount, 0),
      faculty: facultyRows,
      reserves: reserveRows,
      generatedAt: new Date(),
      generatedReason: reason,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
};

/**
 * Re-evaluates a schedule after one of its plans changed. Generates the summary
 * when the schedule becomes Complete, and regenerates an existing summary on
 * any later change (edit / reassignment / unpublish) so it stays accurate.
 */
export const refreshScheduleState = async (scheduleId, reason = "plan changed") => {
  if (!scheduleId) return null;
  const schedule = await ExamSchedule.findById(scheduleId);
  if (!schedule) return null;
  const progress = await scheduleProgress(scheduleId);

  if (schedule.isComplete !== progress.isComplete) {
    schedule.isComplete = progress.isComplete;
    schedule.completedAt = progress.isComplete ? new Date() : null;
    await schedule.save();
  }

  const existing = await DutySummary.exists({ examScheduleId: scheduleId });
  if (progress.isComplete || existing) {
    return generateDutySummary(scheduleId, progress.isComplete && !existing ? "schedule complete" : reason);
  }
  return null;
};
