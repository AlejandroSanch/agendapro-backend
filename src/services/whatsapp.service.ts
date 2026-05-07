import axios from 'axios';
import { env } from '../config/env';

/**
 * Formatea una fecha YYYY-MM-DD a un formato amigable en español.
 * Ej: 2023-10-15 -> domingo, 15 de octubre
 */
function formatWhatsAppDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
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

/**
 * Servicio para interactuar con la WhatsApp Cloud API de Meta.
 */
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
      console.error('Error enviando recordatorio WhatsApp:', error.response?.data || error.message);
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
      console.log(`✨ Confirmación real enviada a ${customerName}`);
    } catch (error: any) {
      console.error('Error enviando confirmación WhatsApp:', error.response?.data || error.message);
    }
  }
};
