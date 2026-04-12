import { z } from 'zod';

export const serviceIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de servicio inválido.')
});

export const createServiceSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.'),
  categoria: z.string().trim().optional().default('general').transform(v => v || 'general'),
  duracionMin: z.number().int().positive('duracionMin debe ser mayor a 0.'),
  precio: z.number().min(0, 'precio debe ser un numero >= 0.'),
  descripcion: z.string().trim().optional().default(''),
  activo: z.boolean().optional().default(true),
  orden: z.number().int().min(0, 'orden debe ser un numero >= 0.').optional()
});

export const updateServiceSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.').optional(),
  categoria: z.string().trim().optional().transform(v => v || 'general'),
  duracionMin: z.number().int().positive('duracionMin debe ser mayor a 0.').optional(),
  precio: z.number().min(0, 'precio debe ser un numero >= 0.').optional(),
  descripcion: z.string().trim().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().min(0, 'orden debe ser un numero >= 0.').optional()
}).refine(data => Object.keys(data).length > 0, {
  message: 'No hay campos para actualizar.'
});
