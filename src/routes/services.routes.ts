import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ServicesController } from '../controllers/services.controller';

export const servicesRouter = Router();

servicesRouter.get('/', requireAuth, ServicesController.list);
servicesRouter.post('/', requireAuth, ServicesController.create);
servicesRouter.patch('/:id', requireAuth, ServicesController.update);
servicesRouter.delete('/:id', requireAuth, ServicesController.delete);
