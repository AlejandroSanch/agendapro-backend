// Refreshed import
import { Request, Response } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  UpdateCategoryInput,
} from '../data/repositories/category.repository';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
  listCategoryQuerySchema,
} from '../validators/categories.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';

export const CategoriesController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const query = listCategoryQuerySchema.parse(req.query);
    const categories = await listCategories(user.id, query.type);
    res.json({ categories });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const data = createCategorySchema.parse(req.body);

    try {
      const created = await createCategory(user.id, {
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
    const user = getAuthUser(req);

    const params = categoryIdParamSchema.parse(req.params);
    const data = updateCategorySchema.parse(req.body);

    const payload: UpdateCategoryInput = {};
    if (data.nombre !== undefined) payload.name = data.nombre;
    if (data.descripcion !== undefined) payload.description = data.descripcion;
    if (data.type !== undefined) payload.type = data.type;

    const updated = await updateCategory(user.id, params.id, payload);

    if (!updated) throw new ApiError(404, 'Categoria no encontrada.');
    res.json({ category: updated });
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const params = categoryIdParamSchema.parse(req.params);

    try {
      const deleted = await deleteCategory(user.id, params.id);
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
