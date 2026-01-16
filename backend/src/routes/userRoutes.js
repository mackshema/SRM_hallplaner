import express from "express";
import { getUsers, createUser, deleteUser } from "../controllers/userController.js";

const router = express.Router();

router.route("/")
    .get(getUsers)
    .post(createUser);

router.route("/:id")
    .delete(deleteUser);

export default router;
