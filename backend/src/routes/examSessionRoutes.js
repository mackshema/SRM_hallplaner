import express from "express";
import {
    getExamSessions,
    createExamSession,
    finalizeExamSession,
    deleteExamSession,
} from "../controllers/examSessionController.js";

const router = express.Router();

router.get("/", getExamSessions);
router.post("/", createExamSession);
router.put("/:id/finalize", finalizeExamSession);
router.delete("/:id", deleteExamSession);

export default router;
