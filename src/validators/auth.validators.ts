import { z } from 'zod';
import { PLANS } from '../constants/catalog';

const validPlanIds = PLANS.map((p) => p.id) as [string, ...string[]];

export const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido.').max(255),
  password: z.string().min(1, 'La contraseña es requerida.').max(100),
});

export const registerSchema = z.object({
  email: z.string().email('Correo electrónico inválido.').max(255),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(100).regex(/^(?=.*[A-Za-z])(?=.*\d).*$/, 'La contraseña debe contener al menos una letra y un número.'),
  name: z.string().min(2, 'El nombre es requerido.').max(255),
  businessName: z.string().min(2, 'El nombre del negocio es requerido.').max(255),
  acceptTerms: z
    .boolean()
    .or(z.string().transform((val) => val === 'true' || val === '1' || val === 'on'))
    .refine((val) => val === true, {
      message: 'Debes aceptar los términos y privacidad.',
    }),
  plan: z.enum(validPlanIds).optional().default('starter'),
});

export const verificationTokenSchema = z.object({
  token: z.string().min(1, 'Token de verificación requerido.'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('Correo electrónico inválido.'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requerido.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Correo electrónico inválido.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token de restablecimiento requerido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(100).regex(/^(?=.*[A-Za-z])(?=.*\d).*$/, 'La contraseña debe contener al menos una letra y un número.'),
});
