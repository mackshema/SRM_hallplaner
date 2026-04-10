import express from "express";
import { getStudentExamDetails, createStudentAccount, changeStudentPassword, getAllStudents, updateStudentAccount, bulkCreateStudents, deleteStudentAccount } from "../controllers/studentController.js";

const router = express.Router();

// Public route for students to lookup their exam hall
router.get("/:rollNumber", getStudentExamDetails);

// Student Authentication endpoints
router.post("/create-account", createStudentAccount);
router.post("/change-password", changeStudentPassword);

// Student Management by Admin
router.get("/", getAllStudents);
router.post("/bulk-create", bulkCreateStudents);
router.put("/:id", updateStudentAccount);
router.delete("/:id", deleteStudentAccount);

export default router;
