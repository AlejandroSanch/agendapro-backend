import { z } from 'zod';

export const categoryIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de categoria inválido.')
});

export const listCategoryQuerySchema = z.object({
  type: z.enum(['service', 'product']).optional()
});

export const createCategorySchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.'),
  descripcion: z.string().trim().optional().default(''),
  type: z.enum(['service', 'product']).default('service')
});

export const updateCategorySchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.').optional(),
  descripcion: z.string().trim().optional(),
  type: z.enum(['service', 'product']).optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'No hay campos para actualizar.'
});
