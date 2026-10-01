import express from "express";
import { requireFaculty } from "../middleware/authMiddleware.js";
import { getFacultyDutyHistory } from "../controllers/facultyDutyHistoryController.js";

const router = express.Router();

// Admins read anyone's history; faculty only their own (checked in the controller)
router.get("/:facultyId", requireFaculty, getFacultyDutyHistory);

export default router;
