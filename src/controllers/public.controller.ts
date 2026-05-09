import { Request, Response } from 'express';
import { env } from '../config/env';
import { z } from 'zod';
import { asyncWrapper } from '../utils/asyncWrapper';
import { PublicService } from '../services/public.service';

const publicIdSchema = z.object({ id: z.string().trim().min(1).max(50) });

/**
 * Confirma una cita de forma pública (sin auth) usando su ID.
 */
export const confirmAppointmentPublic = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = publicIdSchema.parse(req.params);
  await PublicService.confirmAppointment(id, 'web');
  res.json({ success: true, message: 'Cita confirmada correctamente.' });
});

/**
 * Confirma una cita vía GET (para links de email) y redirige al frontend.
 */
export const confirmAppointmentPublicGet = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = publicIdSchema.parse(req.params);
  const frontendUrl = env.frontendBaseUrl;

  try {
    await PublicService.confirmAppointment(id, 'email');
    res.redirect(`${frontendUrl}/confirmar-cita/${id}?confirmed=true`);
  } catch (error) {
    // If appointment not found or other error during redirect flow, handle gracefully
    res.redirect(`${frontendUrl}/confirmar-cita/${id}?error=not_found`);
  }
});

/**
 * Obtiene los detalles públicos de una cita.
 */
export const getAppointmentPublicDetails = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = publicIdSchema.parse(req.params);
  const details = await PublicService.getAppointmentDetails(id);
  res.json(details);
});
