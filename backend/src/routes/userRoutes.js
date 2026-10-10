import express from "express";
import multer from "multer";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { getUsers, createUser, deleteUser, updateUser, bulkUploadFaculty } from "../controllers/userController.js";

const router = express.Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage() });

router.route("/")
    .get(getUsers)
    .post(createUser);

router.post("/bulk-upload", upload.single("file"), bulkUploadFaculty);

router.route("/:id")
    .delete(deleteUser)
    .put(updateUser);

export default router;
