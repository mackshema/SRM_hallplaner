import express from "express";
import { requireAdmin, requireFaculty } from "../middleware/authMiddleware.js";
import { 
    createDelegationRequest, 
    hodApprove, 
    hodReject, 
    facultyAccept, 
    facultyDecline, 
    getDelegationRequests
} from "../controllers/delegationController.js";

const router = express.Router();

router.post("/request", requireFaculty, createDelegationRequest);
router.get("/:id/hod-approve", requireAdmin, hodApprove);
router.get("/:id/hod-reject", requireAdmin, hodReject);
router.get("/:id/faculty-accept", requireFaculty, facultyAccept);
router.get("/:id/faculty-decline", requireFaculty, facultyDecline);
router.get("/requests/:facultyId", requireFaculty, getDelegationRequests);

export default router;
