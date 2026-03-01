import SeatAssignment from "../models/SeatAssignment.js";
import ExamSession from "../models/ExamSession.js";
import Hall from "../models/Hall.js";

/**
 * GET /api/student/:rollNumber
 * Fetch exam details for a student if the plan is finalized.
 */
export const getStudentExamDetails = async (req, res) => {
    try {
        const { rollNumber } = req.params;

        if (!rollNumber) {
            return res.status(400).json({ message: "Roll number is required" });
        }

        // 1. Find the seat assignment for this roll number
        // We might have multiple assignments for different dates, 
        // but usually we want the current one. 
        // For now, let's find the most recent one or all.
        // The user request implies a single lookup.
        const seats = await SeatAssignment.find({ studentRollNumber: rollNumber })
            .populate('examSessionId')
            .populate('hallId');

        if (!seats || seats.length === 0) {
            return res.status(404).json({ message: "No Exam Assignment Found. Please contact Examination Cell." });
        }

        // 2. Filter only those that are FINALIZED (status = "FINAL" in our model)
        const finalizedExams = seats.filter(seat => seat.examSessionId && seat.examSessionId.status === "FINAL");

        if (finalizedExams.length === 0) {
            // Check if any exists but not finalized
            return res.status(404).json({ message: "No finalized exam plan found for this roll number." });
        }

        // 3. Return minimal data as requested
        // Returning multiple if there are multiple dates finalized
        const results = finalizedExams.map(seat => ({
            hall: seat.hallId ? seat.hallId.name : "N/A",
            floor: seat.hallId ? seat.hallId.floor : "N/A",
            date: seat.examSessionId.examDate,
            session: seat.examSessionId.examSession,
            time: seat.examSessionId.examTime,
            rollNumber: seat.studentRollNumber
        }));

        // If there's only one, return it as a single object or array depending on UI needs.
        // The user suggested returning a single object in their logic.
        // Let's return the array to be safe if they have multiple exams.
        res.json(results);

    } catch (err) {
        console.error("Error in getStudentExamDetails:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
