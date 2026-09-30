import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
    createHall,
    getAllHalls,
    getHallById,
    deleteHall,
    assignFacultyToHall,
    updateHall,
    getAllExamDates,
    bulkCreateHalls,
    divideHall,
    mergeHalls,
    getFloors
} from "../controllers/hallController.js";

const router = express.Router();
router.use(requireAdmin);

router.post("/", createHall);
router.post("/bulk-create", bulkCreateHalls);
router.post("/divide", divideHall);
router.post("/merge", mergeHalls);
router.get("/all-exam-dates", getAllExamDates);
router.get("/floors", getFloors);
router.get("/", getAllHalls);
router.get("/:id", getHallById);
router.delete("/:id", deleteHall);
router.put("/:id", updateHall);
router.post("/assign-faculty", assignFacultyToHall);

export default router;
