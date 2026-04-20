// Refreshed import
import { Request, Response } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../data/repositories/category.repository';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
} from '../validators/categories.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

export const CategoriesController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const categories = await listCategories(req.user.id);
    res.json({ categories });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createCategorySchema.parse(req.body);

    const created = await createCategory(req.user.id, {
      name: data.nombre,
      description: data.descripcion,
    });

    if (!created) throw new ApiError(404, 'Usuario no encontrado.');
    res.status(201).json({ category: created });
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = categoryIdParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);

    const updated = await updateCategory(req.user.id, params.id, {
      name: data.nombre,
      description: data.descripcion,
    });

    if (!updated) throw new ApiError(404, 'Categoria no encontrada.');
    res.json({ category: updated });
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = categoryIdParamSchema.parse(req.params);

    try {
      const deleted = await deleteCategory(req.user.id, params.id);
      if (!deleted) throw new ApiError(404, 'Categoria no encontrada.');
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes('servicios asociados')) {
        throw new ApiError(409, error.message);
      }
      throw error;
    }
  })
};
