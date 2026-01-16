import express from "express";
import {
  saveSeatingPlan,
  getFacultyHallSummary,
  generateSeatingPlan,
  getHallSeating,
  getAllSeatAssignments
} from "../controllers/seatingController.js";

const router = express.Router();

// ADMIN — generate seating plan for all halls
router.post("/generate", generateSeatingPlan);

// ADMIN — save seating plan
router.post("/save", saveSeatingPlan);

// GET hall seating assignments
router.get("/hall/:hallId", getHallSeating);

// GET all seat assignments (for exports)
router.get("/all", getAllSeatAssignments);

// FACULTY — read-only summary
router.get("/faculty/:facultyId", getFacultyHallSummary);

export default router;
