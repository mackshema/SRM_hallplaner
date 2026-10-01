import express from "express";
import { requireAdmin, requireFaculty } from "../middleware/authMiddleware.js";
import {
    getHallAbsentees,
    submitHallAbsentees,
    getAbsenteeReport,
    extendAbsenteeWindow
} from "../controllers/absenteeController.js";

const router = express.Router();

router.get("/report/:planType/:planId", requireAdmin, getAbsenteeReport);
router.post("/:planType/:planId/:hallId/extend", requireAdmin, extendAbsenteeWindow);
// Faculty: only their own hall, only inside the window (enforced in the controller)
router.get("/:planType/:planId/:hallId", requireFaculty, getHallAbsentees);
router.put("/:planType/:planId/:hallId", requireFaculty, submitHallAbsentees);

export default router;
