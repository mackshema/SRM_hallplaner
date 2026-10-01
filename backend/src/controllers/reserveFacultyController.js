import mongoose from "mongoose";
import ReserveFaculty from "../models/ReserveFaculty.js";
import FacultyDuty from "../models/FacultyDuty.js";
import User from "../models/User.js";
import Hall from "../models/Hall.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import { loadPlan, planHallsWithStudents, planInvigilators, planModel, reserveQueryForPlan, annaExamTime } from "../services/planService.js";
import { slotCommitments } from "../services/facultyPickerService.js";
import { onPlanChanged } from "../services/planLifecycle.js";
import { isLocked } from "../utils/planStatus.js";

/**
 * Reserve (standby) faculty per exam plan. A reserve is only a link
 * (plan + faculty + role) to the existing faculty record - never a copy.
 *
 * Plans are addressed as { planType: 'internal' | 'anna', planId }.
 */

const EXAM_TYPE = { internal: "Internal", anna: "Anna" };

const requirePlanFromQuery = async (req, res) => {
    const { planType, planId } = { ...req.query, ...req.body };
    const plan = await loadPlan(planType, planId);
    if (!plan) {
        res.status(404).json({ error: "Exam plan not found. Pick the exam first." });
        return null;
    }
    return plan;
};

/**
 * GET /api/reserve-faculty/sessions
 * All exam plans (Internal and Anna University) with their reserve counts.
 */
export const getReserveSessions = async (req, res) => {
    try {
        const [internalSessions, annaSessions, reserveCounts] = await Promise.all([
            ExamSession.find().select("examDate examSession examTime status isPublished publish_at examScheduleId").sort({ examDate: -1, examSession: 1 }).lean(),
            AnnaSeating.find().select("examDate session status isPublished publish_at examScheduleId").sort({ examDate: -1, session: 1 }).lean(),
            ReserveFaculty.aggregate([
                { $match: { status: "reserve" } },
                { $group: { _id: { examDate: "$examDate", session: "$examSession", examType: "$examType" }, n: { $sum: 1 } } },
            ]),
        ]);
        const countOf = (examDate, session, examType) =>
            reserveCounts.find((c) => c._id.examDate === examDate && c._id.session === session && c._id.examType === examType)?.n || 0;

        const sessions = [
            ...internalSessions.map((s) => ({
                id: String(s._id),
                planType: "internal",
                planId: String(s._id),
                examDate: s.examDate,
                session: s.examSession,
                examTime: s.examTime,
                examType: "Internal",
                status: s.status,
                isPublished: s.isPublished,
                publish_at: s.publish_at,
                reserveCount: countOf(s.examDate, s.examSession, "Internal"),
            })),
            ...annaSessions.map((a) => ({
                id: String(a._id),
                planType: "anna",
                planId: String(a._id),
                examDate: a.examDate,
                session: a.session,
                examTime: annaExamTime(a.session),
                examType: "Anna",
                status: a.status,
                isPublished: a.isPublished,
                publish_at: a.publish_at,
                reserveCount: countOf(a.examDate, a.session, "Anna"),
            })),
        ].sort((a, b) => b.examDate.localeCompare(a.examDate) || a.session.localeCompare(b.session) * -1);

        res.json(sessions);
    } catch (error) {
        console.error("Error fetching reserve sessions:", error);
        res.status(500).json({ error: "Failed to fetch exam sessions" });
    }
};

/**
 * GET /api/reserve-faculty?planType&planId
 * Reserve records of one plan, with the faculty details populated from User.
 */
export const getReserveFaculty = async (req, res) => {
    try {
        const plan = await requirePlanFromQuery(req, res);
        if (!plan) return;

        const reserves = await ReserveFaculty.find(reserveQueryForPlan(plan))
            .populate("facultyId", "name username department designation facultyEmail")
            .populate("convertedToHallId", "name floor")
            .populate("replacedFacultyId", "name department designation")
            .lean();

        res.json(reserves);
    } catch (error) {
        console.error("Error fetching reserve faculty:", error);
        res.status(500).json({ error: "Failed to fetch reserve faculty" });
    }
};

/**
 * GET /api/reserve-faculty/available-faculty?planType&planId
 * The existing faculty list, annotated with conflicts in the plan's date/session.
 */
export const getAvailableFaculty = async (req, res) => {
    try {
        const plan = await requirePlanFromQuery(req, res);
        if (!plan) return;

        const [allFaculty, busy, reserves] = await Promise.all([
            User.find({ role: "faculty" }).select("name username department designation facultyEmail").sort({ department: 1, name: 1 }).lean(),
            slotCommitments(plan.examDate, plan.session),
            ReserveFaculty.find({ examDate: plan.examDate, examSession: plan.session, status: { $in: ["reserve", "converted"] } })
                .populate("convertedToHallId", "name").lean(),
        ]);
        const reserveByFaculty = new Map(reserves.map((r) => [String(r.facultyId), r]));

        res.json(allFaculty.map((f) => {
            const id = String(f._id);
            const reserve = reserveByFaculty.get(id);
            const isAssignedReserve = reserve?.status === "reserve";
            const isConvertedReserve = reserve?.status === "converted";
            const conflictReason = isConvertedReserve
                ? `Converted reserve, now in Hall ${reserve.convertedToHallId?.name || ""}`
                : busy.get(id) || null;
            const isAssignedHallDuty = !!conflictReason && !isAssignedReserve && !isConvertedReserve;
            return {
                ...f,
                isAssignedHallDuty,
                assignedHallName: isAssignedHallDuty ? conflictReason : null,
                isAssignedReserve,
                isConvertedReserve,
                reserveId: reserve?._id || null,
                isAvailable: !conflictReason,
                conflictReason: isAssignedReserve ? "Already a reserve for this session" : conflictReason,
            };
        }));
    } catch (error) {
        console.error("Error fetching available faculty:", error);
        res.status(500).json({ error: "Failed to fetch available faculty" });
    }
};

/**
 * POST /api/reserve-faculty  { planType, planId, facultyId }
 * Adds a reserve after checking the faculty isn't busy in the same session.
 */
export const addReserveFaculty = async (req, res) => {
    try {
        const plan = await requirePlanFromQuery(req, res);
        if (!plan) return;
        const { facultyId } = req.body;
        if (!mongoose.isValidObjectId(facultyId)) {
            return res.status(400).json({ error: "facultyId is required" });
        }

        const faculty = await User.findOne({ _id: facultyId, role: "faculty" });
        if (!faculty) {
            return res.status(404).json({ error: "Faculty not found" });
        }

        // Conflict: hall duty (saved or in a draft plan) or reserve in the same date/session
        const busy = await slotCommitments(plan.examDate, plan.session);
        if (busy.has(String(facultyId))) {
            return res.status(400).json({
                error: `Conflict: ${faculty.name} can't be a reserve - ${busy.get(String(facultyId))}.`
            });
        }

        const reserve = await ReserveFaculty.create({
            facultyId,
            examType: EXAM_TYPE[plan.planType],
            examSessionId: plan.planType === "internal" ? plan.planId : null,
            planId: plan.planId,
            examDate: plan.examDate,
            examSession: plan.session,
            role: "reserve",
            status: "reserve"
        });

        await onPlanChanged(plan.planType, plan.planId, { reason: "reserve added" });

        const populated = await ReserveFaculty.findById(reserve._id)
            .populate("facultyId", "name username department designation facultyEmail");
        res.status(201).json(populated);
    } catch (error) {
        console.error("Error adding reserve faculty:", error);
        res.status(500).json({ error: "Failed to add reserve faculty" });
    }
};

/** Plan of an existing reserve record (older records have no planId). */
const planOfReserve = async (reserve) => {
    if (reserve.planId) {
        const planType = reserve.examType === "Anna" ? "anna" : "internal";
        return loadPlan(planType, reserve.planId);
    }
    const planType = reserve.examType === "Anna" ? "anna" : "internal";
    const doc = planType === "anna"
        ? await AnnaSeating.findOne({ examDate: reserve.examDate, session: reserve.examSession }).select("_id")
        : await ExamSession.findOne({ examDate: reserve.examDate, examSession: reserve.examSession }).select("_id");
    return doc ? loadPlan(planType, doc._id) : null;
};

/**
 * DELETE /api/reserve-faculty/:id
 */
export const removeReserveFaculty = async (req, res) => {
    try {
        const reserve = await ReserveFaculty.findById(req.params.id);
        if (!reserve) {
            return res.status(404).json({ error: "Reserve record not found" });
        }
        if (reserve.status === "converted") {
            return res.status(400).json({ error: "This reserve is already serving as a hall invigilator. Remove them from the hall instead." });
        }
        const plan = await planOfReserve(reserve);
        await ReserveFaculty.findByIdAndDelete(reserve._id);
        if (plan) await onPlanChanged(plan.planType, plan.planId, { reason: "reserve removed" });

        res.json({ message: "Reserve faculty removed successfully" });
    } catch (error) {
        console.error("Error removing reserve faculty:", error);
        res.status(500).json({ error: "Failed to remove reserve faculty" });
    }
};

/**
 * GET /api/reserve-faculty/plan-halls?planType&planId
 * Halls of the plan with their current invigilators (for "Use as replacement").
 */
export const getPlanHalls = async (req, res) => {
    try {
        const plan = await requirePlanFromQuery(req, res);
        if (!plan) return;
        const [halls, invigilators] = await Promise.all([planHallsWithStudents(plan), planInvigilators(plan)]);
        const facultyIds = [...new Set([...invigilators.values()].flat())];
        const faculty = await User.find({ _id: { $in: facultyIds } }).select("name department designation").lean();
        const byId = new Map(faculty.map((f) => [String(f._id), f]));
        const hallDocs = await Hall.find({ _id: { $in: halls.map((h) => h.hallId) } }).select("name floor facultyRequired").lean();
        const hallById = new Map(hallDocs.map((h) => [String(h._id), h]));

        res.json(halls
            .map((h) => ({
                _id: h.hallId,
                name: hallById.get(h.hallId)?.name || h.hallName,
                floor: hallById.get(h.hallId)?.floor || "",
                studentCount: h.studentCount,
                facultyRequired: hallById.get(h.hallId)?.facultyRequired || 1,
                invigilators: (invigilators.get(h.hallId) || []).map((id) => ({ _id: id, ...(byId.get(id) || { name: "Unknown" }) })),
            }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })));
    } catch (error) {
        console.error("Error fetching plan halls:", error);
        res.status(500).json({ error: "Failed to fetch halls" });
    }
};

/**
 * POST /api/reserve-faculty/:id/convert  { hallId, replacedFacultyId? }
 * "Use as replacement": the reserve becomes an invigilator of that hall
 * (replacing an absent invigilator if given) and the record is marked converted.
 */
export const convertToHallDuty = async (req, res) => {
    try {
        const { hallId, replacedFacultyId } = req.body;
        if (!mongoose.isValidObjectId(hallId)) {
            return res.status(400).json({ error: "hallId is required to assign duty" });
        }

        const reserve = await ReserveFaculty.findById(req.params.id).populate("facultyId");
        if (!reserve) {
            return res.status(404).json({ error: "Reserve record not found" });
        }
        if (reserve.status === "converted") {
            return res.status(400).json({ error: "This reserve has already been converted to a hall duty" });
        }

        const plan = await planOfReserve(reserve);
        if (!plan) return res.status(404).json({ error: "The exam plan of this reserve no longer exists." });

        const planHalls = await planHallsWithStudents(plan);
        if (!planHalls.some((h) => h.hallId === String(hallId))) {
            return res.status(400).json({ error: "That hall is not part of this exam plan." });
        }
        const hall = await Hall.findById(hallId);
        const reserveId = String(reserve.facultyId._id);

        const invigilators = await planInvigilators(plan);
        if (replacedFacultyId && !(invigilators.get(String(hallId)) || []).includes(String(replacedFacultyId))) {
            return res.status(400).json({ error: "The faculty being replaced is not an invigilator of that hall." });
        }

        // 1. The plan's own hall assignments
        const doc = await planModel(plan.planType).findById(plan.planId);
        const fa = doc.facultyAssignments.find((a) => String(a.hallId) === String(hallId));
        if (fa) {
            fa.facultyIds = fa.facultyIds.filter((id) => id !== String(replacedFacultyId)).concat(reserveId)
                .filter((id, i, all) => all.indexOf(id) === i);
        } else {
            doc.facultyAssignments.push({ hallId, facultyIds: [reserveId] });
        }
        await doc.save();

        // 2. Saved duties (locked plans): replaced faculty loses the duty, reserve gains it
        if (isLocked(plan.status)) {
            if (replacedFacultyId) {
                await FacultyDuty.deleteOne({ facultyId: replacedFacultyId, examDate: plan.examDate, examSession: plan.session });
            }
            await FacultyDuty.updateOne(
                { facultyId: reserveId, examDate: plan.examDate, examSession: plan.session },
                { $set: { hallId, examTime: plan.examTime } },
                { upsert: true }
            );
        }

        // 3. The reserve record (kept, marked converted)
        reserve.status = "converted";
        reserve.planId = reserve.planId || plan.planId;
        reserve.convertedToHallId = hallId;
        reserve.replacedFacultyId = replacedFacultyId || null;
        reserve.convertedAt = new Date();
        await reserve.save();

        await onPlanChanged(plan.planType, plan.planId, { reason: "reserve used as replacement" });

        const updated = await ReserveFaculty.findById(reserve._id)
            .populate("facultyId", "name username department designation facultyEmail")
            .populate("convertedToHallId", "name floor")
            .populate("replacedFacultyId", "name department designation");

        res.json({
            message: `${reserve.facultyId.name} is now invigilating Hall ${hall?.name || ""}`,
            reserve: updated
        });
    } catch (error) {
        console.error("Error converting reserve to hall duty:", error);
        res.status(500).json({ error: "Failed to convert reserve to hall duty" });
    }
};
