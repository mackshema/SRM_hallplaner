import express from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { downloadFullExamPackage, downloadHallLayout, downloadAllHallLayouts } from '../controllers/exportController.js';

const router = express.Router();
router.use(requireAdmin);

router.get('/full-exam/:examPlanId', downloadFullExamPackage);
router.get('/hall-layouts/:examPlanId', downloadAllHallLayouts);
router.get('/hall-layouts/:examPlanId/:hallId', downloadHallLayout);

export default router;
