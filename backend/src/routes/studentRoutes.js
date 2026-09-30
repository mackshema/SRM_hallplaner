import express from "express";
import { requireAdmin, requireAuth } from "../middleware/authMiddleware.js";
import { getStudentExamDetails, createStudentAccount, changeStudentPassword, getAllStudents, updateStudentAccount, bulkCreateStudents, deleteStudentAccount } from "../controllers/studentController.js";

const router = express.Router();

// Public route for students to lookup their exam hall
router.get("/:rollNumber", getStudentExamDetails);

// Any logged-in user; students may only change their own password (checked in the controller)
router.post("/change-password", requireAuth, changeStudentPassword);

// Protect all following routes (Admin only)
router.use(requireAdmin);

// Student Authentication endpoints
router.post("/create-account", createStudentAccount);

// Student Management by Admin
router.get("/", getAllStudents);
router.post("/bulk-create", bulkCreateStudents);
router.put("/:id", updateStudentAccount);
router.delete("/:id", deleteStudentAccount);

export default router;
