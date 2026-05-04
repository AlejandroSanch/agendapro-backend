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
  listCategoryQuerySchema,
} from '../validators/categories.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

export const CategoriesController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const query = listCategoryQuerySchema.parse(req.query);
    const categories = await listCategories(req.user.id, query.type);
    res.json({ categories });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createCategorySchema.parse(req.body);

    try {
      const created = await createCategory(req.user.id, {
        name: data.nombre,
        description: data.descripcion,
        type: data.type,
      });

      if (!created) throw new ApiError(404, 'Usuario no encontrado.');
      res.status(201).json({ category: created });
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ApiError(400, 'Ya existe una categoría con ese nombre.');
      }
      throw error;
    }
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = categoryIdParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);

    const payload: any = {};
    if (data.nombre !== undefined) payload.name = data.nombre;
    if (data.descripcion !== undefined) payload.description = data.descripcion;
    if (data.type !== undefined) payload.type = data.type;

    const updated = await updateCategory(req.user.id, params.id, payload);

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
      if (error instanceof Error && (error.message.includes('servicios asociados') || error.message.includes('productos asociados'))) {
        throw new ApiError(409, error.message);
      }
      throw error;
    }
  })
};
