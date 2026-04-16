import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { CustomersController } from '../controllers/customers.controller';

export const customersRouter = Router();

customersRouter.get('/', requireAuth, CustomersController.list);
customersRouter.get('/:id', requireAuth, CustomersController.getById);
customersRouter.post('/', requireAuth, CustomersController.create);
customersRouter.patch('/:id', requireAuth, CustomersController.update);
customersRouter.patch('/:id/toggle-active', requireAuth, CustomersController.toggleActive);
customersRouter.delete('/:id', requireAuth, CustomersController.delete);
