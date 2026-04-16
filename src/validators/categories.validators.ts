import { z } from 'zod';

export const categoryIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de categoria inválido.')
});

export const createCategorySchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.'),
  descripcion: z.string().trim().optional().default('')
});

export const updateCategorySchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.').optional(),
  descripcion: z.string().trim().optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'No hay campos para actualizar.'
});
