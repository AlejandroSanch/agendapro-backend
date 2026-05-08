import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { env } from '../config/env';
import { getControlPool } from '../data/db';

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
    res.redirect(`${env.frontendBaseUrl}/dashboard/configuracion`);
  }),

  getStatus: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const db = getControlPool();
    const [rows] = await db.query(
      `SELECT provider, expires_at FROM tenant_integrations WHERE user_id = ?`,
      [req.user.id]
    );

    res.json({ integrations: rows });
  }),

  disconnectGoogle: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const db = getControlPool();
    await db.query(
      `DELETE FROM tenant_integrations WHERE user_id = ? AND provider = 'google_calendar'`,
      [req.user.id]
    );

    res.json({ success: true, message: 'Integración desconectada correctamente.' });
  })
};
