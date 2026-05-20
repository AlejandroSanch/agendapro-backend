import { z } from 'zod';
import { paginationQuerySchema } from './common.validators';

export const appointmentIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de cita inválido.'),
});

export const dateRangeQuerySchema = z
  .object({
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usa YYYY-MM-DD.')
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usa YYYY-MM-DD.')
      .optional(),
  })
  .merge(paginationQuerySchema);

const estadosValidos = ['pendiente', 'confirmada', 'completada', 'cancelada'] as const;

export const createAppointmentSchema = z.object({
  clienteNombre: z.string().trim().min(1, 'clienteNombre es requerido.').max(255),
  clienteTelefono: z.string().trim().max(50).optional().default(''),
  servicio: z.string().trim().min(1, 'servicio es requerido.').max(255),
  duracionMin: z.number().int().positive('duracionMin debe ser mayor a 0.'),
  precio: z.number().min(0, 'precio debe ser un numero >= 0.'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha invalida. Usa YYYY-MM-DD.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'hora invalida. Usa HH:mm.'),
  notas: z.string().trim().max(2000).optional().default(''),
  estado: z.enum(['pendiente', 'confirmada', 'completada', 'cancelada'], {
    message: 'estado inválido.',
  }),
  trabajador: z.string().trim().max(255).optional().default(''),
});

export const updateAppointmentSchema = z
  .object({
    clienteNombre: z.string().trim().min(1, 'clienteNombre es requerido.').max(255).optional(),
    clienteTelefono: z.string().trim().max(50).optional(),
    servicio: z.string().trim().min(1, 'servicio es requerido.').max(255).optional(),
    duracionMin: z.number().int().positive('duracionMin debe ser mayor a 0.').optional(),
    precio: z.number().min(0, 'precio debe ser un numero >= 0.').optional(),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha invalida. Usa YYYY-MM-DD.')
      .optional(),
    hora: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'hora invalida. Usa HH:mm.')
      .optional(),
    notas: z.string().trim().max(2000).optional(),
    estado: z
      .enum(['pendiente', 'confirmada', 'completada', 'cancelada'], { message: 'estado inválido.' })
      .optional(),
    trabajador: z.string().trim().max(255).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No hay campos para actualizar.',
  });
