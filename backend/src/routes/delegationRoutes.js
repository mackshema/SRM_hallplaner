import express from "express";
import { 
    createDelegationRequest, 
    hodApprove, 
    hodReject, 
    facultyAccept, 
    facultyDecline, 
    getDelegationRequests
} from "../controllers/delegationController.js";

const router = express.Router();

router.post("/request", createDelegationRequest);
router.get("/:id/hod-approve", hodApprove);
router.get("/:id/hod-reject", hodReject);
router.get("/:id/faculty-accept", facultyAccept);
router.get("/:id/faculty-decline", facultyDecline);
router.get("/requests/:facultyId", getDelegationRequests);

export default router;
