import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { InventoryController } from '../controllers/inventory.controller';

export const inventoryRouter = Router();

// Apply auth middleware to all routes in this router
inventoryRouter.use(requireAuth);

inventoryRouter.get('/logs', InventoryController.listLogs);
inventoryRouter.post('/movements', InventoryController.createMovement);
