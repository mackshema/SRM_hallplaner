import express from "express";
import { getStudentExamDetails } from "../controllers/studentController.js";

const router = express.Router();

// Public route for students to lookup their exam hall
router.get("/:rollNumber", getStudentExamDetails);

export default router;
