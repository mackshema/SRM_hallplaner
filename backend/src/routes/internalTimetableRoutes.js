import express from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { 
    getExamData, 
    uploadTimetable, 
    uploadTimetableRaw, 
    manualMapSubject, 
    generateAllInternalSeating 
} from '../controllers/internalTimetableController.js';

const router = express.Router();
router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage() });

router.get('/data', getExamData);
router.post('/upload-timetable', upload.single('file'), uploadTimetable);
router.post('/upload-timetable-raw', uploadTimetableRaw);
router.post('/manual-map', manualMapSubject);
router.post('/generate-all-seating', generateAllInternalSeating);

export default router;
