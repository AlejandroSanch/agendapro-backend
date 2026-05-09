import { z } from 'zod';
import { PLANS } from '../constants/catalog';

const validPlanIds = PLANS.map((p) => p.id) as [string, ...string[]];

export const patchBusinessSettingsSchema = z.object({
  businessType: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  street: z.string().trim().optional(),
  extNumber: z.string().trim().optional(),
  intNumber: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  logoUrl: z.string().trim().optional(),
  schedules: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        open: z.boolean(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .optional(),
  breakEnabled: z.boolean().optional(),
  breakStart: z.string().nullable().optional(),
  breakEnd: z.string().nullable().optional(),
});

export const onboardingServicesSchema = z.object({
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'El nombre del servicio es requerido.'),
        category: z.string().trim().optional().default('General'),
        durationMin: z
          .number()
          .int()
          .positive('La duración debe ser mayor a 0.')
          .optional()
          .default(30),
        priceCents: z.number().min(0, 'El precio no puede ser negativo.').optional().default(0),
      }),
    )
    .min(1, 'Envía al menos un servicio.'),
});

export const onboardingStaffSchema = z.object({
  staff: z
    .array(
      z.object({
        fullName: z.string().trim().min(1, 'El nombre es requerido.'),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().trim().optional(),
        role: z.string().trim().optional().default('staff'),
        specialties: z.array(z.string()).optional().default([]),
      }),
    )
    .min(1, 'Envía al menos un empleado.'),
});

export const onboardingPlanSchema = z.object({
  plan: z.enum(validPlanIds, { message: 'Plan inválido.' }),
});
