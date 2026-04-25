import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { ProductsController } from '../controllers/products.controller';

export const productsRouter = Router();

productsRouter.get('/', requireAuth, ProductsController.list);
productsRouter.post('/', requireAuth, ProductsController.create);
productsRouter.patch('/:id', requireAuth, ProductsController.update);
