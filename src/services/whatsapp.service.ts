import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Formatea una fecha YYYY-MM-DD a un formato amigable en español.
 * Ej: 2023-10-15 -> domingo, 15 de octubre
 */
function formatWhatsAppDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    if (year === undefined || month === undefined || day === undefined) {
      return dateStr;
    }

    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return dateStr;
  }
}

export const WhatsAppService = {
  /**
   * Envía un mensaje de plantilla para recordatorio de cita.
   */
  sendAppointmentReminder: async (to: string, customerName: string, businessName: string, serviceName: string, date: string, time: string, confirmLink: string) => {
    const url = `https://graph.facebook.com/v17.0/${env.whatsappPhoneNumberId}/messages`;
    const dateFormatted = formatWhatsAppDate(date);

    // Extrae el ID de la cita de forma robusta y añade el sufijo de confirmación
    const match = confirmLink ? confirmLink.match(/\/appointments\/([^/]+)/) : null;
    const appointmentId = match ? match[1] : '';
    const buttonValue = `${appointmentId}/confirm`;

    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: serviceName },
              { type: 'text', text: dateFormatted },
              { type: 'text', text: time },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [
              { type: 'text', text: buttonValue },
            ],
          },
        ],
      },
    };

    try {
      const response = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${env.whatsappAccessToken}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error: any) {
      logger.error(
        {
          err: error.response?.data || error.message,
          to,
          customerName,
        },
        'Error enviando recordatorio WhatsApp',
      );
      throw error;
    }
  },

  /**
   * Envía un mensaje de confirmación inmediata al agendar.
   */
  sendAppointmentConfirmation: async (
    to: string,
    customerName: string,
    businessName: string,
    serviceName: string,
    date: string,
    time: string,
    confirmLink: string,
  ) => {
    const url = `https://graph.facebook.com/v17.0/${env.whatsappPhoneNumberId}/messages`;
    const dateFormatted = formatWhatsAppDate(date);

    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'appointment_confirmation',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customerName },
              { type: 'text', text: serviceName },
              { type: 'text', text: dateFormatted },
              { type: 'text', text: time },
            ],
          },
        ],
      },
    };

    try {
      await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${env.whatsappAccessToken}`,
          'Content-Type': 'application/json',
        },
      });
      logger.info({ customerName, to }, 'Confirmación real enviada vía WhatsApp');
    } catch (error: any) {
      logger.error(
        {
          err: error.response?.data || error.message,
          to,
          customerName,
        },
        'Error enviando confirmación WhatsApp',
      );
      throw error;
    }
  },

  /**
   * Encola un mensaje de confirmación inmediata al agendar.
   */
  queueAppointmentConfirmation: async (
    userId: string,
    to: string,
    customerName: string,
    businessName: string,
    serviceName: string,
    date: string,
    time: string,
    confirmLink: string,
  ) => {
    const { getControlPool } = require('../data/db');
    const crypto = require('crypto');
    const db = getControlPool();
    const jobId = `job_wa_${crypto.randomUUID().replace(/-/g, '')}`;
    const payload = JSON.stringify({ to, customerName, businessName, serviceName, date, time, confirmLink });

    await db.query(
      `INSERT INTO background_jobs (id, user_id, job_type, payload, status, run_at) VALUES (?, ?, 'whatsapp_confirmation', ?, 'pending', NOW())`,
      [jobId, userId, payload]
    );
  },
};
