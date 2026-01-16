import express from "express";
import { loginUser, seedUsers } from "../controllers/authController.js";

const router = express.Router();

router.post("/login", loginUser);
router.post("/seed", seedUsers); // Call this once to init DB

export default router;
