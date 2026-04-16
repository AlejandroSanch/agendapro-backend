import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { CategoriesController } from '../controllers/categories.controller';

export const categoriesRouter = Router();

categoriesRouter.get('/', requireAuth, CategoriesController.list);
categoriesRouter.post('/', requireAuth, CategoriesController.create);
categoriesRouter.patch('/:id', requireAuth, CategoriesController.update);
categoriesRouter.delete('/:id', requireAuth, CategoriesController.delete);
