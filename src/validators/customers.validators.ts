import { z } from 'zod';
export { paginationQuerySchema } from './common.validators';

const sexos = ['masculino', 'femenino', 'otro', ''] as const;

// Acepta email válido o string vacío
const emailField = z
  .string()
  .trim()
  .transform((v) => v || '')
  .pipe(z.union([z.string().email('email inválido.'), z.literal('')]));

// Acepta fecha YYYY-MM-DD o string vacío
const fechaField = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'fechaNacimiento inválida. Usa YYYY-MM-DD.',
  });

export const customerIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de cliente inválido.'),
});

export const createCustomerSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.').max(255),
  telefono: z.string().trim().max(50).optional().default(''),
  email: emailField.optional().default(''),
  fechaNacimiento: fechaField.optional().default(''),
  sexo: z.enum(sexos, { message: 'sexo inválido.' }).optional().default(''),
  notas: z.string().trim().max(2000).optional().default(''),
});

export const updateCustomerSchema = z
  .object({
    nombre: z.string().trim().min(1, 'nombre es requerido.').max(255).optional(),
    telefono: z.string().trim().max(50).optional(),
    email: emailField.optional(),
    fechaNacimiento: fechaField.optional(),
    sexo: z.enum(sexos, { message: 'sexo inválido.' }).optional(),
    notas: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'No hay campos para actualizar.',
  });
