import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
    getExamSessions,
    createExamSession,
    updateExamSession,
    finalizeExamSession,
    unfinalizeExamSession,
    deleteExamSession,
    schedulePublish,
    cancelSchedule,
    unpublishSession,
} from "../controllers/examSessionController.js";

const router = express.Router();
router.use(requireAdmin);

router.get("/", getExamSessions);
router.post("/", createExamSession);
router.put("/:id", updateExamSession);
router.put("/:id/finalize", finalizeExamSession);
router.put("/:id/unfinalize", unfinalizeExamSession);
router.put("/:id/schedule-publish", schedulePublish);
router.put("/:id/cancel-schedule", cancelSchedule);
router.put("/:id/unpublish", unpublishSession);
router.delete("/:id", deleteExamSession);

export default router;

