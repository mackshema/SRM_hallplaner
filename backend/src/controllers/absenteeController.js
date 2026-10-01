import mongoose from "mongoose";
import Hall from "../models/Hall.js";
import User from "../models/User.js";
import Settings from "../models/Settings.js";
import SeatAssignment from "../models/SeatAssignment.js";
import AnnaSeating from "../models/AnnaSeating.js";
import AbsenteeSubmission from "../models/AbsenteeSubmission.js";
import AbsenteeWindowExtension from "../models/AbsenteeWindowExtension.js";
import { loadPlan, planHallsWithStudents, planHallStudents, planInvigilators } from "../services/planService.js";
import { hallAbsenteeWindow, isAssignedInvigilator, findSubmission, buildAbsenteeReport } from "../services/absenteeService.js";
import { HttpError, sendError } from "../services/publishService.js";
import { isPlanVisible, examLiveStatus, formatIST } from "../utils/planStatus.js";

/**
 * Absentee upload by invigilators, inside a window after the exam goes live.
 * Every rule is enforced here, not only in the UI:
 *  - faculty can open/upload only a hall they invigilate in a published plan
 *  - uploads are accepted only while the window is open
 *  - admins can view everything, correct submissions, and extend windows (logged)
 */

const isAdmin = (req) => req.user?.role === "admin";

const loadContext = async (req) => {
    const { planType, planId, hallId } = req.params;
    if (!mongoose.isValidObjectId(hallId)) throw new HttpError(400, "Invalid hall.");
    const plan = await loadPlan(planType, planId);
    if (!plan) throw new HttpError(404, "Seating plan not found.");
    const halls = await planHallsWithStudents(plan);
    if (!halls.some((h) => h.hallId === String(hallId))) throw new HttpError(404, "That hall has no students in this plan.");

    if (!isAdmin(req)) {
        if (!isPlanVisible(plan.doc)) throw new HttpError(403, "This exam plan has not been published yet.");
        if (!(await isAssignedInvigilator(plan, hallId, req.user.id))) {
            throw new HttpError(403, "You can only open the hall you are invigilating.");
        }
    }
    const window = await hallAbsenteeWindow(plan, hallId, isAdmin(req) ? null : req.user.id);
    return { plan, hallId, window };
};

const hallName = async (hallId) => (await Hall.findById(hallId).select("name").lean())?.name || "";

/** GET /api/absentees/:planType/:planId/:hallId - the hall's student list and current submission. */
export const getHallAbsentees = async (req, res) => {
    try {
        const { plan, hallId, window } = await loadContext(req);
        const [students, submission] = await Promise.all([planHallStudents(plan, hallId), findSubmission(plan, hallId)]);
        const absent = new Set(submission?.absentees || []);
        const canEdit = isAdmin(req) || !!window?.isOpen;
        res.json({
            plan: { planType: plan.planType, planId: plan.planId, examDate: plan.examDate, session: plan.session, examTime: plan.examTime },
            hall: { _id: hallId, name: await hallName(hallId) },
            liveStatus: examLiveStatus(plan),
            window,
            canEdit,
            lockedReason: canEdit ? null
                : !window ? "Exam timing hasn't been set for this plan yet."
                : window.isClosed ? `The upload window closed at ${formatIST(window.closesAt)}.`
                : `The upload window opens at ${formatIST(window.opensAt)}.`,
            students: students.map((s) => ({ rollNumber: s.rollNumber, name: s.name, department: s.department, seat: `R${s.row}-C${s.column}-S${s.benchPosition}`, isAbsent: absent.has(s.rollNumber) })),
            submission: submission ? {
                absentees: submission.absentees,
                submittedAt: submission.submittedAt,
                submittedByName: submission.submittedByName,
                edits: (submission.history || []).length,
            } : null,
        });
    } catch (err) {
        sendError(res, err, "Failed to load hall");
    }
};

/** Mirrors the submission onto the seat records, so bench layouts and exports show ABS. */
const applyAbsentFlags = async (plan, hallId, absentees) => {
    const now = new Date();
    const absent = new Set(absentees);
    if (plan.planType === "anna") {
        const doc = await AnnaSeating.findById(plan.planId);
        for (const a of doc.assignments) {
            if (String(a.hallId) !== String(hallId)) continue;
            const isAbsent = absent.has(a.rollNumber);
            if (a.isAbsent !== isAbsent) {
                a.isAbsent = isAbsent;
                a.markedAbsentAt = isAbsent ? now : null;
            }
        }
        await doc.save();
    } else {
        await SeatAssignment.updateMany(
            { examSessionId: plan.planId, hallId, studentRollNumber: { $in: absentees } },
            { $set: { isAbsent: true, markedAbsentAt: now } }
        );
        await SeatAssignment.updateMany(
            { examSessionId: plan.planId, hallId, studentRollNumber: { $nin: absentees } },
            { $set: { isAbsent: false, markedAbsentAt: null, markedAbsentBy: null } }
        );
    }
};

/**
 * PUT /api/absentees/:planType/:planId/:hallId  { absentees: [rollNumber] }
 * Submit or edit (while the window is open). Admins may correct at any time.
 */
export const submitHallAbsentees = async (req, res) => {
    try {
        const { plan, hallId, window } = await loadContext(req);
        if (!isAdmin(req)) {
            if (!window) throw new HttpError(400, "Exam timing hasn't been set for this plan, so absentees can't be uploaded yet.");
            if (!window.isOpen) {
                throw new HttpError(403, window.isClosed
                    ? `The absentee upload window closed at ${formatIST(window.closesAt)}. Ask the exam cell to re-open it.`
                    : `The absentee upload window opens at ${formatIST(window.opensAt)}.`);
            }
        }

        const list = Array.isArray(req.body.absentees) ? req.body.absentees : null;
        if (!list) throw new HttpError(400, "absentees must be a list of register numbers.");
        const students = await planHallStudents(plan, hallId);
        const inHall = new Set(students.map((s) => s.rollNumber));
        const absentees = [...new Set(list.map((r) => String(r).trim().toUpperCase()).filter(Boolean))];
        const unknown = absentees.filter((r) => !inHall.has(r));
        if (unknown.length) throw new HttpError(400, `Not seated in this hall: ${unknown.join(", ")}`);

        const user = await User.findById(req.user.id).select("name username").lean();
        const now = new Date();
        const entry = { absentees, submittedBy: req.user.id, submittedByName: user?.name || req.user.username || "", submittedAt: now };
        const submission = await AbsenteeSubmission.findOneAndUpdate(
            { planType: plan.planType, planId: plan.planId, hallId },
            {
                $set: { ...entry, examDate: plan.examDate, session: plan.session },
                $push: { history: entry },
            },
            { upsert: true, new: true }
        ).lean();
        await applyAbsentFlags(plan, hallId, absentees);

        res.json({
            message: `Saved ${absentees.length} absentee${absentees.length === 1 ? "" : "s"}.`,
            submission: { absentees: submission.absentees, submittedAt: submission.submittedAt, submittedByName: submission.submittedByName, edits: submission.history.length },
        });
    } catch (err) {
        sendError(res, err, "Failed to save absentees");
    }
};

/**
 * GET /api/absentees/report/:planType/:planId  (admin)
 * Per hall: invigilators, submitted or not, count, list, and whether the window
 * closed with no submission. Includes the extension log.
 */
export const getAbsenteeReport = async (req, res) => {
    try {
        const plan = await loadPlan(req.params.planType, req.params.planId);
        if (!plan) throw new HttpError(404, "Seating plan not found.");
        res.json(await buildAbsenteeReport(plan));
    } catch (err) {
        sendError(res, err, "Failed to load absentee report");
    }
};

/**
 * POST /api/absentees/:planType/:planId/:hallId/extend  (admin)
 * { minutes: number, reason: string, facultyId? }
 * Re-opens / extends the window for a hall (or one invigilator of it). Logged.
 */
export const extendAbsenteeWindow = async (req, res) => {
    try {
        const { planType, planId, hallId } = req.params;
        const plan = await loadPlan(planType, planId);
        if (!plan) throw new HttpError(404, "Seating plan not found.");
        if (!plan.start_at) throw new HttpError(400, "Set the exam timing for this plan first.");
        const minutes = Number(req.body.minutes);
        const reason = String(req.body.reason || "").trim();
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) throw new HttpError(400, "Extension must be between 1 and 1440 minutes.");
        if (!reason) throw new HttpError(400, "A reason is required.");
        const { facultyId } = req.body;
        if (facultyId && !(await isAssignedInvigilator(plan, hallId, facultyId))) {
            throw new HttpError(400, "That faculty member doesn't invigilate this hall.");
        }

        const current = await hallAbsenteeWindow(plan, hallId, facultyId || null);
        const now = new Date();
        const base = current && current.closesAt > now ? current.closesAt : now;
        const extendedUntil = new Date(base.getTime() + minutes * 60 * 1000);

        const record = await AbsenteeWindowExtension.create({
            planType, planId, hallId,
            facultyId: facultyId || null,
            extendedUntil,
            reason,
            grantedBy: req.user?.username || "admin",
        });
        console.log(`[ABSENTEE] Window for ${planType} plan ${planId} hall ${hallId}${facultyId ? ` (faculty ${facultyId})` : ""} extended to ${extendedUntil.toISOString()} by ${record.grantedBy}: ${reason}`);
        res.status(201).json({ message: `Upload window open until ${formatIST(extendedUntil)}.`, extension: record });
    } catch (err) {
        sendError(res, err, "Failed to extend the upload window");
    }
};
