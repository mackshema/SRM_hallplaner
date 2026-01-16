import express from "express";
import {
    createHall,
    getAllHalls,
    getHallById,
    deleteHall,
    assignFacultyToHall
} from "../controllers/hallController.js";

const router = express.Router();

router.post("/", createHall);
router.get("/", getAllHalls);
router.get("/:id", getHallById);
router.delete("/:id", deleteHall);
router.post("/assign-faculty", assignFacultyToHall);

export default router;
