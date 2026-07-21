import express from 'express';
import { requireAdmin } from '../middleware/authMiddleware.js';
import { getSettings, updateSettings } from '../controllers/settingsController.js';

const router = express.Router();
router.use(requireAdmin);

router.get('/', getSettings);
router.put('/', updateSettings);

export default router;
