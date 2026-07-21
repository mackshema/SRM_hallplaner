import express from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { downloadAnnaExamPackage, downloadAnnaConsolidated, downloadAnnaLayouts } from '../controllers/exportController.js';
import {
  uploadStudents,
  uploadTimetable,
  uploadTimetableRaw,
  generateAnnaSeating,
  getSeatingPlan,
  getAllSeatingPlans,
  getExamData,
  updateStatus,
  manualMapSubject,
  deleteSeatingPlan,
  generateAllAnnaSeating
} from '../controllers/annaUniversityController.js';

const router = express.Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage() });

router.get('/data', getExamData);
router.post('/upload-students', upload.single('file'), uploadStudents);
router.post('/upload-timetable', upload.single('file'), uploadTimetable);
router.post('/upload-timetable-raw', express.json(), uploadTimetableRaw);
router.post('/generate-seating', express.json(), generateAnnaSeating);
router.post('/generate-all-seating', express.json(), generateAllAnnaSeating);
router.get('/seating-plans', getAllSeatingPlans);
router.get('/seating-plan', getSeatingPlan);
router.delete('/seating-plan/:id', deleteSeatingPlan);
router.post('/update-status', express.json(), updateStatus);
router.post('/manual-map', express.json(), manualMapSubject);
router.get('/export-package/:examDate/:session', downloadAnnaExamPackage);
router.get('/export-consolidated/:examDate/:session', downloadAnnaConsolidated);
router.get('/export-layouts/:examDate/:session', downloadAnnaLayouts);

export default router;
