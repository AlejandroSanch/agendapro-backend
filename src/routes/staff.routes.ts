import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { StaffController } from '../controllers/staff.controller';

export const staffRouter = Router();

staffRouter.get('/', requireAuth, StaffController.list);
staffRouter.post('/', requireAuth, StaffController.create);
staffRouter.patch('/:id', requireAuth, StaffController.update);
staffRouter.patch('/:id/toggle-active', requireAuth, StaffController.toggleActive);
staffRouter.delete('/:id', requireAuth, StaffController.delete);
