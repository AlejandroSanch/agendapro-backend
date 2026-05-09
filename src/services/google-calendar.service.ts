import { google } from 'googleapis';
import { env } from '../config/env';
import { getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export interface CalendarAppointment {
  id: string;
  fecha: string;
  hora: string;
  duracionMin: number;
  servicio: string;
  clienteNombre: string;
  clienteTelefono: string;
  notas: string;
  trabajador: string;
}

export const GoogleCalendarService = {
  getAuthUrl(userId: string): string {
    const oauth2Client = new google.auth.OAuth2(
      env.googleClientId,
      env.googleClientSecret,
      env.googleRedirectUri
    );
    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Necesario para obtener el refresh_token
      prompt: 'consent',      // Forzar consentimiento siempre para asegurar el refresh_token
      scope: SCOPES,
      state: userId,          // Pasar el userId para saber a quién asignarle el token al volver
    });
  },

  async handleCallback(code: string, userId: string): Promise<void> {
    const oauth2Client = new google.auth.OAuth2(
      env.googleClientId,
      env.googleClientSecret,
      env.googleRedirectUri
    );
    const { tokens } = await oauth2Client.getToken(code);
    const db = getControlPool();
    
    await db.query(`
      INSERT INTO tenant_integrations (user_id, provider, access_token, refresh_token, expires_at, created_at, updated_at)
      VALUES (?, 'google_calendar', ?, ?, FROM_UNIXTIME(?), NOW(), NOW())
      ON DUPLICATE KEY UPDATE 
        access_token = VALUES(access_token), 
        refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
        expires_at = VALUES(expires_at),
        updated_at = NOW()
    `, [
      userId,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
    ]);
  },

  async getCalendarClient(userId: string) {
    const db = getControlPool();
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT access_token, refresh_token, expires_at FROM tenant_integrations WHERE user_id = ? AND provider = 'google_calendar' LIMIT 1`,
      [userId]
    );

    const integration = rows[0];
    if (!integration) return null;

    const client = new google.auth.OAuth2(
      env.googleClientId,
      env.googleClientSecret,
      env.googleRedirectUri
    );

    client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      // Date from DB might be string or Date object depending on mysql2 config, assume Date object or string parsable by Date
      expiry_date: integration.expires_at ? new Date(integration.expires_at).getTime() : null
    });

    // Automatically save refreshed tokens
    client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.query(`UPDATE tenant_integrations SET access_token = ?, expires_at = FROM_UNIXTIME(?) WHERE user_id = ? AND provider = 'google_calendar'`, [
          tokens.access_token,
          tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
          userId
        ]);
      }
      if (tokens.refresh_token) {
        await db.query(`UPDATE tenant_integrations SET refresh_token = ? WHERE user_id = ? AND provider = 'google_calendar'`, [
          tokens.refresh_token,
          userId
        ]);
      }
    });

    return google.calendar({ version: 'v3', auth: client });
  },

  async pushEvent(userId: string, appointment: CalendarAppointment, action: 'create' | 'update' | 'delete') {
    if (!env.googleClientId) return; // Si no está configurado, ignora.

    try {
      const calendar = await this.getCalendarClient(userId);
      if (!calendar) return; // El negocio no ha conectado Google Calendar

      const eventId = `agendapro${appointment.id.replace(/[^a-z0-9]/gi, '')}`;

      if (action === 'delete') {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: eventId,
        });
        return;
      }

      // Format dates for Google Calendar
      const startDate = new Date(`${appointment.fecha}T${appointment.hora}:00`);
      const endDate = new Date(startDate.getTime() + appointment.duracionMin * 60000);

      const event = {
        id: eventId,
        summary: `Cita AgendaPro: ${appointment.servicio}`,
        description: `Cliente: ${appointment.clienteNombre}\nTeléfono: ${appointment.clienteTelefono}\nNotas: ${appointment.notas || 'N/A'}\nEspecialista: ${appointment.trabajador || 'Sin asignar'}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Mexico_City',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Mexico_City',
        },
      };

      if (action === 'create') {
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: event,
        });
      } else if (action === 'update') {
        await calendar.events.update({
          calendarId: 'primary',
          eventId: eventId,
          requestBody: event,
        });
      }
    } catch (error) {
      console.error('[GoogleCalendarService] Error pushing event:', error);
    }
  }
};
