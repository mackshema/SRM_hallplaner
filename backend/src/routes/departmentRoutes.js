import express from "express";
import {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
} from "../controllers/departmentController.js";

const router = express.Router();

router.route("/")
    .get(getDepartments)
    .post(createDepartment);

router.route("/:id")
    .put(updateDepartment)
    .delete(deleteDepartment);

export default router;
