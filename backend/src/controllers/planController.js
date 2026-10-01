import mongoose from "mongoose";
import Hall from "../models/Hall.js";
import User from "../models/User.js";
import FacultyDuty from "../models/FacultyDuty.js";
import ExamSchedule from "../models/ExamSchedule.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import { loadPlan, planHallsWithStudents, planInvigilators, planModel, reserveQueryForPlan } from "../services/planService.js";
import { slotCommitments, slotSoftRules, totalDutyCounts } from "../services/facultyPickerService.js";
import { onPlanChanged } from "../services/planLifecycle.js";
import { publishPlan, cancelSchedule, unpublishPlan, setPlanTiming, sendError, HttpError } from "../services/publishService.js";
import { allocateFaculty, computeDepartmentQuota, vacancyMessage, NO_DEPARTMENT } from "../utils/facultyAllocation.js";
import { isLocked } from "../utils/planStatus.js";

/**
 * Plan-level actions shared by Internal and Anna University plans:
 *   /api/plans/:planType/:planId/...
 */

const requirePlan = async (req) => {
    const plan = await loadPlan(req.params.planType, req.params.planId);
    if (!plan) throw new HttpError(404, "Seating plan not found.");
    return plan;
};

/**
 * Halls that need invigilators, how many each has, and the department quota
 * for the plan (quota = total required / 2, see utils/facultyAllocation.js).
 */
const staffingState = async (plan) => {
    const [halls, invigilators] = await Promise.all([planHallsWithStudents(plan), planInvigilators(plan)]);
    const hallDocs = await Hall.find({ _id: { $in: halls.map((h) => h.hallId) } }).select("name floor facultyRequired").lean();
    const hallById = new Map(hallDocs.map((h) => [String(h._id), h]));
    const rows = halls
        .map((h) => ({
            hallId: h.hallId,
            hallName: hallById.get(h.hallId)?.name || h.hallName,
            floor: hallById.get(h.hallId)?.floor || "",
            required: hallById.get(h.hallId)?.facultyRequired || 1,
            assigned: invigilators.get(h.hallId) || [],
        }))
        .sort((a, b) => String(a.hallName).localeCompare(String(b.hallName), undefined, { numeric: true }));
    const totalRequired = rows.reduce((n, r) => n + r.required, 0);
    const assignedIds = rows.flatMap((r) => r.assigned);
    const faculty = await User.find({ _id: { $in: assignedIds } }).select("department").lean();
    const deptOf = new Map(faculty.map((f) => [String(f._id), f.department || NO_DEPARTMENT]));
    const deptUsage = {};
    assignedIds.forEach((id) => { const d = deptOf.get(id) || NO_DEPARTMENT; deptUsage[d] = (deptUsage[d] || 0) + 1; });
    const vacancies = rows
        .filter((r) => r.assigned.length < r.required)
        .map((r) => ({ hallId: r.hallId, hallName: r.hallName, required: r.required, assigned: r.assigned.length, missing: r.required - r.assigned.length }));
    return { halls: rows, totalRequired, quota: computeDepartmentQuota(totalRequired), deptUsage, vacancies };
};

/** Saves a hall's invigilator list on the plan, and on FacultyDuty if the plan is locked. */
const saveHallInvigilators = async (plan, hallId, facultyIds) => {
    const doc = await planModel(plan.planType).findById(plan.planId);
    const fa = doc.facultyAssignments.find((a) => String(a.hallId) === String(hallId));
    if (fa) fa.facultyIds = facultyIds;
    else doc.facultyAssignments.push({ hallId, facultyIds });
    await doc.save();

    if (isLocked(plan.status)) {
        const current = await FacultyDuty.find({ examDate: plan.examDate, examSession: plan.session, hallId }).lean();
        const keep = new Set(facultyIds.map(String));
        const removed = current.filter((d) => !keep.has(String(d.facultyId))).map((d) => d._id);
        if (removed.length) await FacultyDuty.deleteMany({ _id: { $in: removed } });
        for (const id of facultyIds) {
            await FacultyDuty.updateOne(
                { facultyId: id, examDate: plan.examDate, examSession: plan.session },
                { $set: { hallId, examTime: plan.examTime } },
                { upsert: true }
            );
        }
    }
};

/** GET /:planType/:planId/vacancies */
export const getVacancies = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const state = await staffingState(plan);
        res.json({ ...state, message: vacancyMessage(state.vacancies) });
    } catch (err) {
        sendError(res, err, "Failed to load vacancies");
    }
};

/**
 * POST /:planType/:planId/fill-vacancies
 * Re-runs auto-assignment for the remaining vacancies only. Existing
 * invigilators are kept and count toward the department quota.
 */
export const fillVacancies = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const state = await staffingState(plan);
        if (!state.vacancies.length) return res.json({ ...state, filled: 0, message: null });

        const [allFaculty, busy, soft, dutyCounts] = await Promise.all([
            User.find({ role: "faculty" }).select("name department").lean(),
            slotCommitments(plan.examDate, plan.session, { ignorePlanId: plan.planId }),
            slotSoftRules(plan.examDate, plan.session),
            totalDutyCounts(),
        ]);
        const inPlan = new Set(state.halls.flatMap((h) => h.assigned));
        const isEligible = (f) => {
            const id = String(f._id);
            if (inPlan.has(id) || busy.has(id)) return false;
            if (soft.previousSessionIds.has(id)) return false;
            return (soft.weeklyCount[id] || 0) < 4;
        };

        const allocation = allocateFaculty({
            halls: state.halls.map((h) => ({ hallId: h.hallId, hallName: h.hallName, required: h.required, assigned: h.assigned })),
            faculty: allFaculty,
            isEligible,
            dutyCounts,
        });

        let filled = 0;
        for (const [i, hall] of state.halls.entries()) {
            const next = allocation.facultyAssignments[i].facultyIds;
            if (next.length !== hall.assigned.length) {
                filled += next.length - hall.assigned.length;
                await saveHallInvigilators(plan, hall.hallId, next);
            }
        }
        if (filled) await onPlanChanged(plan.planType, plan.planId, { reason: "vacancies filled" });

        const after = await staffingState(plan);
        res.json({ ...after, filled, message: vacancyMessage(after.vacancies) });
    } catch (err) {
        sendError(res, err, "Failed to fill vacancies");
    }
};

/**
 * GET /:planType/:planId/faculty-picker?hallId=
 * Every faculty member with department, designation, total duty count and
 * whether they can be added (same-session conflicts block; quota only warns).
 */
export const getFacultyPicker = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const [state, allFaculty, busy, soft, dutyCounts] = await Promise.all([
            staffingState(plan),
            User.find({ role: "faculty" }).select("name username department designation").sort({ department: 1, name: 1 }).lean(),
            slotCommitments(plan.examDate, plan.session, { ignorePlanId: plan.planId }),
            slotSoftRules(plan.examDate, plan.session),
            totalDutyCounts(),
        ]);
        const hallOf = new Map();
        state.halls.forEach((h) => h.assigned.forEach((id) => hallOf.set(id, h.hallName)));

        res.json({
            quota: state.quota,
            deptUsage: state.deptUsage,
            faculty: allFaculty.map((f) => {
                const id = String(f._id);
                const dept = f.department || NO_DEPARTMENT;
                const conflict = hallOf.has(id) ? `Already invigilating Hall ${hallOf.get(id)} in this plan` : busy.get(id) || null;
                const warnings = [];
                if ((state.deptUsage[dept] || 0) >= state.quota) warnings.push(`${dept} has reached its quota of ${state.quota}`);
                if (soft.previousSessionIds.has(id)) warnings.push("On duty in the previous session");
                if ((soft.weeklyCount[id] || 0) >= 4) warnings.push("Already has 4 duties this week");
                return {
                    _id: id,
                    name: f.name,
                    username: f.username,
                    department: f.department || "",
                    designation: f.designation || "",
                    dutyCount: dutyCounts[id] || 0,
                    conflict,
                    warnings,
                };
            }),
        });
    } catch (err) {
        sendError(res, err, "Failed to load faculty");
    }
};

/**
 * POST /:planType/:planId/halls/:hallId/faculty  { facultyId }
 * Manual pick. May exceed the department quota (returns a warning) but never
 * double-books a faculty member in the same session.
 */
export const addHallFaculty = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const { hallId } = req.params;
        const { facultyId } = req.body;
        if (!mongoose.isValidObjectId(facultyId)) throw new HttpError(400, "facultyId is required.");

        const state = await staffingState(plan);
        const hall = state.halls.find((h) => h.hallId === String(hallId));
        if (!hall) throw new HttpError(400, "That hall has no students in this plan.");

        const faculty = await User.findOne({ _id: facultyId, role: "faculty" }).select("name department").lean();
        if (!faculty) throw new HttpError(404, "Faculty not found.");
        const id = String(facultyId);

        const otherHall = state.halls.find((h) => h.assigned.includes(id));
        if (otherHall) throw new HttpError(400, `${faculty.name} is already invigilating Hall ${otherHall.hallName} in this session.`);
        const busy = await slotCommitments(plan.examDate, plan.session, { ignorePlanId: plan.planId });
        if (busy.has(id)) throw new HttpError(400, `${faculty.name} can't be added: ${busy.get(id)}.`);

        const dept = faculty.department || NO_DEPARTMENT;
        const warnings = [];
        if ((state.deptUsage[dept] || 0) >= state.quota) {
            warnings.push(`${dept} now has ${(state.deptUsage[dept] || 0) + 1} invigilators, above its quota of ${state.quota}.`);
        }
        if (hall.assigned.length >= hall.required) {
            warnings.push(`Hall ${hall.hallName} now has more invigilators than required (${hall.required}).`);
        }

        await saveHallInvigilators(plan, hallId, [...hall.assigned, id]);
        await onPlanChanged(plan.planType, plan.planId, { reason: "invigilator added" });

        const after = await staffingState(plan);
        res.json({ ...after, warnings, message: vacancyMessage(after.vacancies) });
    } catch (err) {
        sendError(res, err, "Failed to add faculty");
    }
};

/** DELETE /:planType/:planId/halls/:hallId/faculty/:facultyId */
export const removeHallFaculty = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const { hallId, facultyId } = req.params;
        const state = await staffingState(plan);
        const hall = state.halls.find((h) => h.hallId === String(hallId));
        if (!hall || !hall.assigned.includes(String(facultyId))) {
            throw new HttpError(404, "That faculty member is not assigned to this hall.");
        }
        await saveHallInvigilators(plan, hallId, hall.assigned.filter((id) => id !== String(facultyId)));
        await onPlanChanged(plan.planType, plan.planId, { reason: "invigilator removed" });
        const after = await staffingState(plan);
        res.json({ ...after, message: vacancyMessage(after.vacancies) });
    } catch (err) {
        sendError(res, err, "Failed to remove faculty");
    }
};

/** GET /:planType/:planId/reserves - reserve names for the bench layout footer. */
export const getPlanReserves = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const reserves = await ReserveFaculty.find(reserveQueryForPlan(plan, ["reserve"]))
            .populate("facultyId", "name department designation").lean();
        res.json(reserves.filter((r) => r.facultyId).map((r) => ({
            _id: r.facultyId._id,
            name: r.facultyId.name,
            department: r.facultyId.department || "",
            designation: r.facultyId.designation || "",
        })));
    } catch (err) {
        sendError(res, err, "Failed to load reserves");
    }
};

/* ---------- Publish flow (both plan types) ---------- */

export const publish = async (req, res) => {
    try { res.json(await publishPlan(req.params.planType, req.params.planId, req.body)); }
    catch (err) { sendError(res, err, "Failed to publish plan"); }
};

export const cancelPublishSchedule = async (req, res) => {
    try { res.json(await cancelSchedule(req.params.planType, req.params.planId)); }
    catch (err) { sendError(res, err, "Failed to cancel schedule"); }
};

export const unpublish = async (req, res) => {
    try { res.json(await unpublishPlan(req.params.planType, req.params.planId)); }
    catch (err) { sendError(res, err, "Failed to unpublish plan"); }
};

/** PUT /:planType/:planId/timing  { startTime?, endTime?, start_at?, end_at?, absentee_window_minutes? } */
export const updateTiming = async (req, res) => {
    try { res.json(await setPlanTiming(req.params.planType, req.params.planId, req.body)); }
    catch (err) { sendError(res, err, "Failed to update exam timing"); }
};

/** PUT /:planType/:planId/schedule  { examScheduleId | null } - puts the plan under an exam schedule. */
export const assignSchedule = async (req, res) => {
    try {
        const plan = await requirePlan(req);
        const { examScheduleId } = req.body;
        if (examScheduleId && !(await ExamSchedule.exists({ _id: examScheduleId }))) {
            throw new HttpError(404, "Exam schedule not found.");
        }
        const doc = await planModel(plan.planType).findByIdAndUpdate(
            plan.planId, { $set: { examScheduleId: examScheduleId || null } }, { new: true }
        );
        await onPlanChanged(plan.planType, plan.planId, { reason: "plan moved to schedule", previousScheduleId: plan.examScheduleId });
        res.json(doc);
    } catch (err) {
        sendError(res, err, "Failed to assign exam schedule");
    }
};
