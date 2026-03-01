import express from 'express';
import { downloadFullExamPackage } from '../controllers/exportController.js';

const router = express.Router();

router.get('/full-exam/:examPlanId', downloadFullExamPackage);

export default router;
