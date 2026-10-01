import Settings from "../models/Settings.js";
import AbsenteeWindowExtension from "../models/AbsenteeWindowExtension.js";
import AbsenteeSubmission from "../models/AbsenteeSubmission.js";
import FacultyDuty from "../models/FacultyDuty.js";
import Hall from "../models/Hall.js";
import User from "../models/User.js";
import { absenteeWindow, examLiveStatus } from "../utils/planStatus.js";
import { planHallsWithStudents, planInvigilators } from "./planService.js";

/** Absentee upload window for one hall (and optionally one invigilator) of a plan. */
export const hallAbsenteeWindow = async (plan, hallId, facultyId = null, settings = null, now = new Date()) => {
  const s = settings || (await Settings.findOne().select("absenteeWindowMinutes").lean());
  const extensions = await AbsenteeWindowExtension.find({
    planType: plan.planType,
    planId: plan.planId,
    hallId,
    ...(facultyId ? { $or: [{ facultyId: null }, { facultyId }] } : { facultyId: null }),
  }).lean();
  return absenteeWindow(plan, s, extensions, now);
};

/** True when the faculty member has a saved hall duty for this hall in the plan's slot. */
export const isAssignedInvigilator = async (plan, hallId, facultyId) =>
  !!(await FacultyDuty.exists({ facultyId, hallId, examDate: plan.examDate, examSession: plan.session }));

export const findSubmission = (plan, hallId) =>
  AbsenteeSubmission.findOne({ planType: plan.planType, planId: plan.planId, hallId }).lean();

/**
 * Absentee report of one plan: per hall the invigilators, whether absentees were
 * submitted, count and list, the window, and the extension log. Shared by the
 * report screen and the exported absentee report.
 */
export const buildAbsenteeReport = async (plan) => {
    const settings = await Settings.findOne().select("absenteeWindowMinutes").lean();
    const [halls, invigilators, submissions, extensions] = await Promise.all([
        planHallsWithStudents(plan),
        planInvigilators(plan),
        AbsenteeSubmission.find({ planType: plan.planType, planId: plan.planId }).lean(),
        AbsenteeWindowExtension.find({ planType: plan.planType, planId: plan.planId }).sort({ createdAt: -1 }).lean(),
    ]);
    const hallDocs = await Hall.find({ _id: { $in: halls.map((h) => h.hallId) } }).select("name floor").lean();
    const hallById = new Map(hallDocs.map((h) => [String(h._id), h]));
    const facultyIds = [...new Set([...invigilators.values()].flat().concat(extensions.map((e) => String(e.facultyId)).filter((x) => x !== "null")))];
    const faculty = await User.find({ _id: { $in: facultyIds } }).select("name department").lean();
    const nameOf = new Map(faculty.map((f) => [String(f._id), f.name]));

    const rows = [];
    for (const h of halls) {
        const window = await hallAbsenteeWindow(plan, h.hallId, null, settings);
        const sub = submissions.find((s) => String(s.hallId) === h.hallId);
        rows.push({
            hallId: h.hallId,
            hallName: hallById.get(h.hallId)?.name || h.hallName,
            floor: hallById.get(h.hallId)?.floor || "",
            studentCount: h.studentCount,
            invigilators: (invigilators.get(h.hallId) || []).map((id) => ({ _id: id, name: nameOf.get(id) || "Unknown" })),
            submitted: !!sub,
            submittedAt: sub?.submittedAt || null,
            submittedByName: sub?.submittedByName || "",
            absenteeCount: sub?.absentees?.length || 0,
            absentees: sub?.absentees || [],
            window,
            closedWithoutSubmission: !!window?.isClosed && !sub,
            extensions: extensions.filter((e) => String(e.hallId) === h.hallId).map((e) => ({
                extendedUntil: e.extendedUntil,
                reason: e.reason,
                grantedBy: e.grantedBy,
                facultyName: e.facultyId ? nameOf.get(String(e.facultyId)) || "" : "",
                createdAt: e.createdAt,
            })),
        });
    }
    rows.sort((a, b) => String(a.hallName).localeCompare(String(b.hallName), undefined, { numeric: true }));

    return {
        plan: { planType: plan.planType, planId: plan.planId, examDate: plan.examDate, session: plan.session, start_at: plan.start_at, end_at: plan.end_at, absentee_window_minutes: plan.absentee_window_minutes },
        liveStatus: examLiveStatus(plan),
        defaultWindowMinutes: settings?.absenteeWindowMinutes ?? 120,
        totals: {
            halls: rows.length,
            submitted: rows.filter((r) => r.submitted).length,
            absentees: rows.reduce((n, r) => n + r.absenteeCount, 0),
            closedWithoutSubmission: rows.filter((r) => r.closedWithoutSubmission).length,
        },
        halls: rows,
    };
};
