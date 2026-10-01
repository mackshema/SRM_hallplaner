import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
    getVacancies,
    fillVacancies,
    getFacultyPicker,
    addHallFaculty,
    removeHallFaculty,
    getPlanReserves,
    publish,
    cancelPublishSchedule,
    unpublish,
    updateTiming,
    assignSchedule
} from "../controllers/planController.js";

// Plan-level actions for Internal and Anna University plans:
//   /api/plans/:planType(internal|anna)/:planId/...
const router = express.Router();

router.use(requireAdmin);

router.get("/:planType/:planId/vacancies", getVacancies);
router.post("/:planType/:planId/fill-vacancies", fillVacancies);
router.get("/:planType/:planId/faculty-picker", getFacultyPicker);
router.post("/:planType/:planId/halls/:hallId/faculty", addHallFaculty);
router.delete("/:planType/:planId/halls/:hallId/faculty/:facultyId", removeHallFaculty);
router.get("/:planType/:planId/reserves", getPlanReserves);
router.put("/:planType/:planId/publish", publish);
router.put("/:planType/:planId/cancel-schedule", cancelPublishSchedule);
router.put("/:planType/:planId/unpublish", unpublish);
router.put("/:planType/:planId/timing", updateTiming);
router.put("/:planType/:planId/schedule", assignSchedule);

export default router;
