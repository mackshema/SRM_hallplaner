import express from "express";
import jwt from "jsonwebtoken";
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

/**
 * The action buttons in delegation emails can't send a login token, so their
 * links carry a signed `?t=` token scoped to one request and one action.
 * Without a valid link token, the normal login check applies.
 */
const allowEmailLink = (action, fallback) => (req, res, next) => {
    if (req.query.t) {
        try {
            const payload = jwt.verify(req.query.t, process.env.JWT_SECRET);
            if (payload.rid === req.params.id && payload.action === action) return next();
        } catch {
            return res.status(401).send("<h1>This link has expired or is invalid. Please log in to respond.</h1>");
        }
    }
    return fallback(req, res, next);
};

router.post("/request", requireFaculty, createDelegationRequest);
router.get("/:id/hod-approve", allowEmailLink('hod-approve', requireAdmin), hodApprove);
router.get("/:id/hod-reject", allowEmailLink('hod-reject', requireAdmin), hodReject);
router.get("/:id/faculty-accept", allowEmailLink('faculty-accept', requireFaculty), facultyAccept);
router.get("/:id/faculty-decline", allowEmailLink('faculty-decline', requireFaculty), facultyDecline);
router.get("/requests/:facultyId", requireFaculty, getDelegationRequests);

export default router;
