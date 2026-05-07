import { Router } from 'express';
import * as ReportsController from '../controllers/reports.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/stats', requireAuth, ReportsController.getStats);

export { router as reportsRouter };
