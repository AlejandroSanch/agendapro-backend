import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { SalesController } from '../controllers/sales.controller';

export const salesRouter = Router();

salesRouter.post('/checkout', requireAuth, SalesController.checkout);
