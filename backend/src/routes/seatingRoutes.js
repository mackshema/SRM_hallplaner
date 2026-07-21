import express from "express";
import { requireAdmin, requireFaculty } from "../middleware/authMiddleware.js";
import {
  saveSeatingPlan,
  getFacultyHallSummary,
  generateSeatingPlan,
  getHallSeating,
  getAllSeatAssignments,
  finalizeSeatingPlan,
  getAllDuties,
  markAbsent
} from "../controllers/seatingController.js";

const router = express.Router();

router.patch('/mark-absent/:assignmentId', requireFaculty, markAbsent);

// ADMIN — generate seating plan for all halls
router.post("/generate", requireAdmin, generateSeatingPlan);

// ADMIN — finalize seating plan
router.post("/finalize", requireAdmin, finalizeSeatingPlan);

// ADMIN — save seating plan
router.post("/save", requireAdmin, saveSeatingPlan);

// GET all faculty duties (Summary)
router.get("/duties/all", requireAdmin, getAllDuties);

// GET hall seating assignments
router.get("/hall/:hallId", requireAdmin, getHallSeating);

// GET all seat assignments (for exports)
router.get("/all", requireAdmin, getAllSeatAssignments);

// FACULTY — read-only summary
router.get("/faculty/:facultyId", requireFaculty, getFacultyHallSummary);

export default router;
