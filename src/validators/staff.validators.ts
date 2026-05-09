import { z } from 'zod';

const weekDayCodes = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;

const staffScheduleDaySchema = z.object({
  dia: z.enum(weekDayCodes),
  label: z.string().trim().default(''),
  activo: z.boolean().default(true),
  desde: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
    .default('09:00'),
  hasta: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
    .default('18:00'),
});

export const staffIdParamSchema = z.object({
  id: z.string().trim().min(1, 'ID de empleado inválido.'),
});

export const createStaffSchema = z.object({
  nombre: z.string().trim().min(1, 'nombre es requerido.'),
  telefono: z.string().trim().optional().default(''),
  email: z.string().trim().optional().default(''),
  rol: z.enum(['admin', 'staff', 'viewer']).optional().default('staff'),
  especialidades: z.array(z.string().trim()).optional().default([]),
  horarioPropio: z.boolean().optional().default(false),
  horario: z.array(staffScheduleDaySchema).optional().default([]),
  descansoPropio: z.boolean().optional().default(false),
  descansoDesde: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
    .nullable()
    .optional(),
  descansoHasta: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
    .nullable()
    .optional(),
  activo: z.boolean().optional().default(true),
});

export const updateStaffSchema = z
  .object({
    nombre: z.string().trim().min(1, 'nombre es requerido.').optional(),
    telefono: z.string().trim().optional(),
    email: z.string().trim().optional(),
    rol: z.enum(['admin', 'staff', 'viewer']).optional(),
    especialidades: z.array(z.string().trim()).optional(),
    horarioPropio: z.boolean().optional(),
    horario: z.array(staffScheduleDaySchema).optional(),
    descansoPropio: z.boolean().optional(),
    descansoDesde: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
      .nullable()
      .optional(),
    descansoHasta: z
      .string()
      .trim()
      .regex(/^\d{2}:\d{2}$/, 'Formato HH:MM requerido.')
      .nullable()
      .optional(),
    activo: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No hay campos para actualizar.',
  });
