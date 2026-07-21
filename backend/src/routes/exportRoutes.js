import express from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { downloadFullExamPackage } from '../controllers/exportController.js';

const router = express.Router();
router.use(requireAdmin);

router.get('/full-exam/:examPlanId', downloadFullExamPackage);

export default router;
