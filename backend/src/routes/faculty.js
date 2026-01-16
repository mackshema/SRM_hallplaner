import express from "express";
import HallDuty from "../models/HallDuty.js";
import { requireFaculty } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * GET faculty assigned halls
 */
router.get("/my-halls", requireFaculty, async (req, res) => {
  try {
    const facultyId = req.user._id;

    const duties = await HallDuty.find({ facultyId }).sort({
      examDate: 1,
      examSession: 1
    });

    res.json(duties);
  } catch (err) {
    console.error("Faculty dashboard error:", err);
    res.status(500).json({ message: "Failed to load hall duties" });
  }
});

export default router;
