import express from "express";
import SeatAssignment from "../models/SeatAssignment.js";
import HallDuty from "../models/HallDuty.js";
import Faculty from "../models/Faculty.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * SAVE SEATING PLAN
 * Admin only
 */
router.post("/save-seating-plan", requireAdmin, async (req, res) => {
  try {
    const {
      hallId,
      hallName,
      floor,
      examDate,
      examSession,
      examTime,
      seats,
      facultyIds
    } = req.body;

    /* -----------------------------
       1️⃣ SAVE FULL SEATING (ADMIN)
    ----------------------------- */
    await SeatAssignment.findOneAndUpdate(
      { hallId, examDate, examSession },
      {
        hallId,
        hallName,
        examDate,
        examSession,
        examTime,
        seats
      },
      { upsert: true, new: true }
    );

    /* -----------------------------
       2️⃣ UPDATE FACULTY DUTIES
    ----------------------------- */
    for (const facultyId of facultyIds) {
      await HallDuty.findOneAndUpdate(
        {
          facultyId,
          hallId,
          examDate,
          examSession
        },
        {
          facultyId,
          hallId,
          hallName,
          floor,
          examDate,
          examSession,
          examTime
        },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Save seating plan error:", err);
    res.status(500).json({ message: "Failed to save seating plan" });
  }
});

export default router;
