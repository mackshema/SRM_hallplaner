import mongoose from "mongoose";
import ExamSchedule from "../models/ExamSchedule.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import DutySummary from "../models/DutySummary.js";
import Settings from "../models/Settings.js";
import { scheduleProgress, refreshScheduleState } from "../services/dutySummaryService.js";
import { onPlanChanged } from "../services/planLifecycle.js";

/**
 * Exam schedules (cycles): IAT 1, IAT 2, Model, Anna University... A seating
 * plan joins a schedule through its own examScheduleId.
 */

export const getCategories = async () => {
    const settings = await Settings.getSettings();
    return (settings.examCategories || []).filter((c) => c.key);
};

const withProgress = async (schedule) => {
    const progress = await scheduleProgress(schedule._id);
    const summary = await DutySummary.findOne({ examScheduleId: schedule._id }).select("generatedAt isComplete").lean();
    return {
        ...schedule,
        totalPlans: progress.totalPlans,
        publishedPlans: progress.publishedPlans,
        isComplete: progress.isComplete,
        plans: progress.plans,
        summaryGeneratedAt: summary?.generatedAt || null,
    };
};

/** GET /api/exam-schedules */
export const listSchedules = async (req, res) => {
    try {
        const schedules = await ExamSchedule.find().sort({ createdAt: -1 }).lean();
        res.json(await Promise.all(schedules.map(withProgress)));
    } catch (err) {
        console.error("Error listing exam schedules:", err);
        res.status(500).json({ error: "Failed to load exam schedules" });
    }
};

/** GET /api/exam-schedules/categories */
export const listCategories = async (req, res) => {
    try {
        res.json(await getCategories());
    } catch (err) {
        console.error("Error listing categories:", err);
        res.status(500).json({ error: "Failed to load exam categories" });
    }
};

const cleanInput = (body) => {
    const out = {};
    for (const key of ["name", "category", "academicYear", "semester", "notes"]) {
        if (body[key] !== undefined) out[key] = String(body[key] ?? "").trim();
    }
    return out;
};

/** POST /api/exam-schedules  { name, category, academicYear?, semester? } */
export const createSchedule = async (req, res) => {
    try {
        const data = cleanInput(req.body);
        if (!data.name) return res.status(400).json({ error: "Schedule name is required." });
        const categories = await getCategories();
        if (data.category && !categories.some((c) => c.key === data.category)) {
            return res.status(400).json({ error: "Unknown exam category." });
        }
        const schedule = await ExamSchedule.create(data);
        res.status(201).json(await withProgress(schedule.toObject()));
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: "A schedule with this name already exists for that academic year." });
        console.error("Error creating exam schedule:", err);
        res.status(500).json({ error: "Failed to create exam schedule" });
    }
};

/** Re-syncs every plan of a schedule (their duty rows copy the schedule's name/category). */
const resyncSchedulePlans = async (scheduleId, reason) => {
    const [internal, anna] = await Promise.all([
        ExamSession.find({ examScheduleId: scheduleId }).select("_id").lean(),
        AnnaSeating.find({ examScheduleId: scheduleId }).select("_id").lean(),
    ]);
    for (const p of internal) await onPlanChanged("internal", p._id, { reason });
    for (const p of anna) await onPlanChanged("anna", p._id, { reason });
};

/** PUT /api/exam-schedules/:id */
export const updateSchedule = async (req, res) => {
    try {
        const data = cleanInput(req.body);
        if (data.name === "") return res.status(400).json({ error: "Schedule name is required." });
        const schedule = await ExamSchedule.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true }).lean();
        if (!schedule) return res.status(404).json({ error: "Exam schedule not found." });
        await resyncSchedulePlans(schedule._id, "schedule details changed");
        res.json(await withProgress(schedule));
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ error: "A schedule with this name already exists for that academic year." });
        console.error("Error updating exam schedule:", err);
        res.status(500).json({ error: "Failed to update exam schedule" });
    }
};

/** DELETE /api/exam-schedules/:id - plans are kept, just unlinked. */
export const deleteSchedule = async (req, res) => {
    try {
        const schedule = await ExamSchedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ error: "Exam schedule not found." });
        const [internal, anna] = await Promise.all([
            ExamSession.find({ examScheduleId: schedule._id }).select("_id").lean(),
            AnnaSeating.find({ examScheduleId: schedule._id }).select("_id").lean(),
        ]);
        await ExamSession.updateMany({ examScheduleId: schedule._id }, { $set: { examScheduleId: null } });
        await AnnaSeating.updateMany({ examScheduleId: schedule._id }, { $set: { examScheduleId: null } });
        await DutySummary.deleteOne({ examScheduleId: schedule._id });
        await schedule.deleteOne();
        for (const p of internal) await onPlanChanged("internal", p._id, { reason: "schedule deleted" });
        for (const p of anna) await onPlanChanged("anna", p._id, { reason: "schedule deleted" });
        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting exam schedule:", err);
        res.status(500).json({ error: "Failed to delete exam schedule" });
    }
};

/** GET /api/exam-schedules/plans - every plan with its schedule, for the membership picker. */
export const listAllPlans = async (req, res) => {
    try {
        const [internal, anna] = await Promise.all([
            ExamSession.find().select("examDate examSession status publish_at examScheduleId").lean(),
            AnnaSeating.find().select("examDate session status publish_at examScheduleId").lean(),
        ]);
        res.json([
            ...internal.map((p) => ({ planType: "internal", planId: String(p._id), examDate: p.examDate, session: p.examSession, status: p.status, publish_at: p.publish_at, examScheduleId: p.examScheduleId ? String(p.examScheduleId) : null })),
            ...anna.map((p) => ({ planType: "anna", planId: String(p._id), examDate: p.examDate, session: p.session, status: p.status, publish_at: p.publish_at, examScheduleId: p.examScheduleId ? String(p.examScheduleId) : null })),
        ].sort((a, b) => a.examDate.localeCompare(b.examDate) || (a.session === "FN" ? -1 : 1)));
    } catch (err) {
        console.error("Error listing plans:", err);
        res.status(500).json({ error: "Failed to load plans" });
    }
};

/**
 * PUT /api/exam-schedules/:id/plans  { plans: [{ planType, planId }] }
 * Sets exactly which plans belong to the schedule.
 */
export const setSchedulePlans = async (req, res) => {
    try {
        const schedule = await ExamSchedule.findById(req.params.id).lean();
        if (!schedule) return res.status(404).json({ error: "Exam schedule not found." });
        const wanted = (req.body.plans || []).filter((p) => ["internal", "anna"].includes(p.planType) && mongoose.isValidObjectId(p.planId));

        const affected = [];
        for (const [planType, Model] of [["internal", ExamSession], ["anna", AnnaSeating]]) {
            const ids = wanted.filter((p) => p.planType === planType).map((p) => new mongoose.Types.ObjectId(p.planId));
            const leaving = await Model.find({ examScheduleId: schedule._id, _id: { $nin: ids } }).select("_id").lean();
            const joining = await Model.find({ _id: { $in: ids }, examScheduleId: { $ne: schedule._id } }).select("_id examScheduleId").lean();
            await Model.updateMany({ _id: { $in: leaving.map((p) => p._id) } }, { $set: { examScheduleId: null } });
            await Model.updateMany({ _id: { $in: ids } }, { $set: { examScheduleId: schedule._id } });
            leaving.forEach((p) => affected.push({ planType, planId: p._id, previousScheduleId: schedule._id }));
            joining.forEach((p) => affected.push({ planType, planId: p._id, previousScheduleId: p.examScheduleId }));
        }
        for (const a of affected) {
            await onPlanChanged(a.planType, a.planId, { reason: "schedule plans changed", previousScheduleId: a.previousScheduleId });
        }
        await refreshScheduleState(schedule._id, "schedule plans changed");
        res.json(await withProgress(await ExamSchedule.findById(schedule._id).lean()));
    } catch (err) {
        console.error("Error setting schedule plans:", err);
        res.status(500).json({ error: "Failed to update schedule plans" });
    }
};
