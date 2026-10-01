import ExamSession from "../models/ExamSession.js";
import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import { autoPromoteDuePlans, onPlanChanged } from "../services/planLifecycle.js";
import { loadPlan, deletePlanDuties } from "../services/planService.js";
import { publishPlan, cancelSchedule as cancelPlanSchedule, unpublishPlan, sendError } from "../services/publishService.js";

/* ===============================
   GET ALL EXAM SESSIONS
================================ */
export const getExamSessions = async (req, res) => {
    try {
        // Read-time check: SCHEDULED sessions whose publish time passed become PUBLISHED
        await autoPromoteDuePlans();
        const sessions = await ExamSession.find().sort({ examDate: 1, examSession: 1 });
        res.json(sessions);
    } catch (err) {
        console.error("Error fetching exam sessions:", err);
        res.status(500).json({ error: "Failed to fetch exam sessions" });
    }
};

/* ===============================
   CREATE NEW EXAM SESSION
================================ */
export const createExamSession = async (req, res) => {
    try {
        const { examDate, examSession, examTime } = req.body;

        // Check for duplicate
        const existing = await ExamSession.findOne({ examDate, examSession });
        if (existing) {
            return res.status(400).json({ error: "An exam session already exists for this date and time." });
        }

        // Initialize with ALL currently available halls
        const allHalls = await Hall.find({}, '_id');

        const newSession = await ExamSession.create({
            examDate,
            examSession,
            examTime,
            status: "DRAFT",
            activeHalls: allHalls.map(h => h._id),
            activeDepartments: []
        });

        res.json(newSession);
    } catch (err) {
        console.error("Error creating exam session:", err);
        res.status(500).json({ error: "Failed to create exam session" });
    }
};

/* ===============================
   UPDATE EXAM SESSION
================================ */
export const updateExamSession = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const session = await ExamSession.findByIdAndUpdate(id, updates, { new: true });

        if (!session) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        // Publishing via the legacy isPublished flag also changes what dashboards show
        if ("isPublished" in updates || "status" in updates || "examScheduleId" in updates) {
            await onPlanChanged("internal", id, { reason: "plan updated" });
        }

        res.json(session);
    } catch (err) {
        console.error("Error updating exam session:", err);
        res.status(500).json({ error: "Failed to update exam session" });
    }
};

/* ===============================
   FINALIZE EXAM SESSION
================================ */
export const finalizeExamSession = async (req, res) => {
    try {
        const { id } = req.params;

        const session = await ExamSession.findByIdAndUpdate(
            id,
            { status: "FINAL", finalizedAt: new Date() },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        await onPlanChanged("internal", id, { reason: "plan finalized" });
        res.json(session);
    } catch (err) {
        console.error("Error finalizing exam session:", err);
        res.status(500).json({ error: "Failed to finalize exam session" });
    }
};

/* ===============================
   UN-FINALIZE EXAM SESSION (Revert to Draft)
================================ */
export const unfinalizeExamSession = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await loadPlan("internal", id);
        if (!plan) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        // Cleanup this plan's duties (not the other module's in the same slot)
        await deletePlanDuties(plan);

        const session = await ExamSession.findByIdAndUpdate(
            id,
            { status: "DRAFT", isPublished: false, publish_at: null },
            { new: true }
        );

        await onPlanChanged("internal", id, { reason: "plan unlocked for editing" });
        res.json(session);
    } catch (err) {
        console.error("Error unfinalizing exam session:", err);
        res.status(500).json({ error: "Failed to unfinalize exam session" });
    }
};

/* ===============================
   SCHEDULE PUBLISH (or Publish Now)
   Body: { publish_at: ISO string | null, startTime?, endTime?, absentee_window_minutes? }
   publish_at = null → publish immediately (now)
================================ */
export const schedulePublish = async (req, res) => {
    try {
        res.json(await publishPlan("internal", req.params.id, req.body));
    } catch (err) {
        sendError(res, err, "Failed to schedule publish");
    }
};

/* ===============================
   CANCEL SCHEDULE (revert to FINAL)
================================ */
export const cancelSchedule = async (req, res) => {
    try {
        res.json(await cancelPlanSchedule("internal", req.params.id));
    } catch (err) {
        sendError(res, err, "Failed to cancel schedule");
    }
};

/* ===============================
   UNPUBLISH (revert Published to FINAL)
================================ */
export const unpublishSession = async (req, res) => {
    try {
        res.json(await unpublishPlan("internal", req.params.id));
    } catch (err) {
        sendError(res, err, "Failed to unpublish session");
    }
};

/* ===============================
   DELETE EXAM SESSION
================================ */
export const deleteExamSession = async (req, res) => {
    try {
        const { id } = req.params;

        const plan = await loadPlan("internal", id);
        if (plan) {
            await deletePlanDuties(plan);
            await ReserveFaculty.deleteMany({ $or: [{ planId: id }, { examSessionId: id }] });
            await ExamSession.findByIdAndDelete(id);
            await SeatAssignment.deleteMany({ examSessionId: id });
            // Removes its duty records and refreshes its exam schedule
            await onPlanChanged("internal", id, { reason: "plan deleted", previousScheduleId: plan.examScheduleId });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting exam session:", err);
        res.status(500).json({ error: "Failed to delete exam session" });
    }
};
