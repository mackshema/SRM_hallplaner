import express from 'express';
import multer from 'multer';
import {
  uploadStudents,
  uploadTimetable,
  uploadTimetableRaw,
  generateAnnaSeating,
  getSeatingPlan,
  getExamData,
  updateStatus
} from '../controllers/annaUniversityController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/data', getExamData);
router.post('/upload-students', upload.single('file'), uploadStudents);
router.post('/upload-timetable', upload.single('file'), uploadTimetable);
router.post('/upload-timetable-raw', express.json(), uploadTimetableRaw);
router.post('/generate-seating', express.json(), generateAnnaSeating);
router.get('/seating-plan', getSeatingPlan);
router.post('/update-status', express.json(), updateStatus);

export default router;
