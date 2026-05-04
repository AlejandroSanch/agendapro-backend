import { z } from 'zod';

export const productIdParamSchema = z.object({
  id: z.string().min(1, 'ID de producto requerido'),
});

export const createProductSchema = z.object({
  nombre: z.string().min(1, 'Nombre requerido').max(255),
  sku: z.string().max(255).optional().nullable(),
  unidad: z.string().max(32).optional().default('pieza'),
  precio: z.number().min(0, 'Precio inválido'),
  costo: z.number().min(0, 'Costo inválido').optional().default(0),
  stock: z.number().int().optional().default(0),
  alertaStock: z.number().int().optional().default(0),
  activo: z.boolean().optional().default(true),
  proveedorId: z.string().optional().nullable(),
  categoriaId: z.string().optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial();

export const createProductBulkSchema = z.array(createProductSchema).min(1, 'La lista de productos no puede estar vacía');
