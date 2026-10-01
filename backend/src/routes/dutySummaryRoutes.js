import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { getDutySummary, regenerateDutySummary } from "../controllers/dutySummaryController.js";

const router = express.Router();

router.use(requireAdmin);

router.get("/:scheduleId", getDutySummary);
router.post("/:scheduleId/regenerate", regenerateDutySummary);

export default router;
