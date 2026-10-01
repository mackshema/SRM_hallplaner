import express from "express";
import { requireAdmin, requireFaculty } from "../middleware/authMiddleware.js";
import {
  getExportConfig,
  exportPlanDocument,
  startPlanPackage,
  exportDutySummary,
  startSchedulePackage,
  exportFacultyHistory,
  getExportJob,
  downloadExportJob,
} from "../controllers/exportV2Controller.js";

// Excel / PDF exports. The old Word exports remain at /api/export and /api/anna/export-*.
const router = express.Router();

router.get("/config", requireAdmin, getExportConfig);
router.get("/plan/:planType/:planId/:docKey", requireAdmin, exportPlanDocument);
router.post("/plan/:planType/:planId/package", requireAdmin, startPlanPackage);
router.get("/schedule/:scheduleId/duty-summary", requireAdmin, exportDutySummary);
router.post("/schedule/:scheduleId/package", requireAdmin, startSchedulePackage);
router.get("/faculty/:facultyId/history", requireFaculty, exportFacultyHistory);
router.get("/jobs/:jobId", requireFaculty, getExportJob);
router.get("/jobs/:jobId/download", requireFaculty, downloadExportJob);

export default router;
