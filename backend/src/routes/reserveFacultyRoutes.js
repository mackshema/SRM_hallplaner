import express from "express";
import { requireAdmin } from "../middleware/authMiddleware.js";
import {
    getReserveSessions,
    getReserveFaculty,
    getAvailableFaculty,
    addReserveFaculty,
    removeReserveFaculty,
    convertToHallDuty,
    getPlanHalls
} from "../controllers/reserveFacultyController.js";

const router = express.Router();

router.use(requireAdmin);

router.get("/sessions", getReserveSessions);
router.get("/", getReserveFaculty);
router.get("/available-faculty", getAvailableFaculty);
router.get("/plan-halls", getPlanHalls);
router.post("/", addReserveFaculty);
router.delete("/:id", removeReserveFaculty);
router.post("/:id/convert", convertToHallDuty);

export default router;
