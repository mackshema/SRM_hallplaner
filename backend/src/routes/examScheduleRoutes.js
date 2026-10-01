import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
    listSchedules,
    listCategories,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    listAllPlans,
    setSchedulePlans
} from "../controllers/examScheduleController.js";

const router = express.Router();

router.use(requireAdmin);

router.get("/", listSchedules);
router.get("/categories", listCategories);
router.get("/plans", listAllPlans);
router.post("/", createSchedule);
router.put("/:id", updateSchedule);
router.delete("/:id", deleteSchedule);
router.put("/:id/plans", setSchedulePlans);

export default router;
