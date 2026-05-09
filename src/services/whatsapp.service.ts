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
      month: 'long' 
    });
  } catch {
    return dateStr;
  }
}

export const WhatsAppService = {
  /**
   * Envía un mensaje de plantilla para recordatorio de cita.
   */
  sendAppointmentReminder: async (to: string, customerName: string, date: string, time: string) => {
    const url = `https://graph.facebook.com/v17.0/${env.whatsappPhoneNumberId}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'hello_world', 
        language: { code: 'en_US' }
      }
    };

    try {
      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${env.whatsappAccessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      logger.error({ 
        err: error.response?.data || error.message,
        to,
        customerName 
      }, 'Error enviando recordatorio WhatsApp');
      throw error;
    }
  },

  /**
   * Envía un mensaje de confirmación inmediata al agendar.
   */
  sendAppointmentConfirmation: async (to: string, customerName: string, serviceName: string, date: string, time: string) => {
    const url = `https://graph.facebook.com/v17.0/${env.whatsappPhoneNumberId}/messages`;
    
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'hello_world', 
        language: { code: 'en_US' }
      }
    };

    try {
      await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${env.whatsappAccessToken}`,
          'Content-Type': 'application/json'
        }
      });
      logger.info({ customerName, to }, 'Confirmación real enviada vía WhatsApp');
    } catch (error: any) {
      logger.error({ 
        err: error.response?.data || error.message,
        to,
        customerName 
      }, 'Error enviando confirmación WhatsApp');
    }
  }
};
