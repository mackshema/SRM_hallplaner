import ExamSession from "../models/ExamSession.js";
import SeatAssignment from "../models/SeatAssignment.js";
import Hall from "../models/Hall.js";
import FacultyDuty from "../models/FacultyDuty.js";

/* ===============================
   GET ALL EXAM SESSIONS
================================ */
export const getExamSessions = async (req, res) => {
    try {
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
import Department from "../models/Department.js";

export const createExamSession = async (req, res) => {
    try {
        const { examDate, examSession, examTime } = req.body;

        // Check for duplicate
        const existing = await ExamSession.findOne({ examDate, examSession });
        if (existing) {
            return res.status(400).json({ error: "An exam session already exists for this date and time." });
        }

        // Initialize with ALL currently available halls and departments
        // This makes the transition seamless - new sessions start with everything active.
        const allHalls = await Hall.find({}, '_id');
        const allDepartments = await Department.find({}, '_id');

        const newSession = await ExamSession.create({
            examDate,
            examSession,
            examTime,
            status: "DRAFT",
            activeHalls: allHalls.map(h => h._id),
            activeDepartments: allDepartments.map(d => d._id)
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
        const updates = req.body; // activeHalls, activeDepartments, etc.

        const session = await ExamSession.findByIdAndUpdate(id, updates, { new: true });

        if (!session) {
            return res.status(404).json({ error: "Exam session not found" });
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

        res.json(session);
    } catch (err) {
        console.error("Error finalizing exam session:", err);
        res.status(500).json({ error: "Failed to finalize exam session" });
    }
};


/* ===============================
   UN-FINALIZE EXAM SESSION (Revert to Draft)
================================ */
/* ===============================
   UN-FINALIZE EXAM SESSION (Revert to Draft)
   ================================ */
export const unfinalizeExamSession = async (req, res) => {
    try {
        const { id } = req.params;

        const session = await ExamSession.findByIdAndUpdate(
            id,
            { status: "DRAFT" },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        // Cleanup Duties
        await FacultyDuty.deleteMany({
            examDate: session.examDate,
            examSession: session.examSession
        });

        res.json(session);
    } catch (err) {
        console.error("Error unfinalizing exam session:", err);
        res.status(500).json({ error: "Failed to unfinalize exam session" });
    }
};

/* ===============================
   DELETE EXAM SESSION
================================ */
export const deleteExamSession = async (req, res) => {
    try {
        const { id } = req.params;

        const session = await ExamSession.findById(id);
        if (session) {
            await FacultyDuty.deleteMany({
                examDate: session.examDate,
                examSession: session.examSession
            });
            await ExamSession.findByIdAndDelete(id);
            await SeatAssignment.deleteMany({ examSessionId: id });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error deleting exam session:", err);
        res.status(500).json({ error: "Failed to delete exam session" });
    }
};
