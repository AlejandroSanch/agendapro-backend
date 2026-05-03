import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { AppointmentsController } from '../controllers/appointments.controller';

export const appointmentsRouter = Router();

appointmentsRouter.get('/stream', requireAuth, AppointmentsController.stream);
appointmentsRouter.get('/', requireAuth, AppointmentsController.list);
appointmentsRouter.post('/', requireAuth, AppointmentsController.create);
appointmentsRouter.patch('/:id', requireAuth, AppointmentsController.update);
