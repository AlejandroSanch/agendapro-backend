import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { env } from '../config/env';

export const IntegrationsController = {
  getGoogleAuthUrl: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    if (!env.googleClientId) {
      throw new ApiError(500, 'Google Calendar Integration no está configurada en el servidor.');
    }
    const url = GoogleCalendarService.getAuthUrl(req.user.id);
    res.json({ url });
  }),

  googleCallback: asyncWrapper(async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const userId = req.query.state as string;

    if (!code || !userId) {
      throw new ApiError(400, 'Faltan parámetros de OAuth.');
    }

    await GoogleCalendarService.handleCallback(code, userId);

    // Redirigir de vuelta al frontend (Settings page)
    res.redirect(`${env.frontendBaseUrl}/dashboard/settings`);
  })
};
