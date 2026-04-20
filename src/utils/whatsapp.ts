import { env } from '../config/env';

export interface WhatsAppMessage {
  to: string;
  body: string;
}

export interface WhatsAppProvider {
  sendMessage(to: string, body: string): Promise<boolean>;
}

/**
 * Mock Provider for local testing/development
 */
class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, body: string): Promise<boolean> {
    console.log('--- [MOCK WHATSAPP SEND] ---');
    console.log(`TO: ${to}`);
    console.log(`BODY: ${body}`);
    console.log('----------------------------');
    return true;
  }
}

/**
 * Meta Cloud API Provider (Ready for production)
 * This is a template. You'll need WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in your .env
 */
class CloudAPIWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, body: string): Promise<boolean> {
    // Para la API Oficial de Meta, usualmente usas mensajes de plantilla (templates).
    // Aquí implementamos un envío de texto libre simplificado para el ejemplo.
    try {
      // Nota: En producción Meta requiere que el número esté en formato internacional sin el '+' 
      const cleanPhone = to.replace(/\D/g, '');
      
      console.log(`[CloudAPI] Sending message to ${cleanPhone}...`);
      
      // Simulación de llamada a Meta (fetch / axios)
      // const res = await fetch(`https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     messaging_product: 'whatsapp',
      //     to: cleanPhone,
      //     type: 'text',
      //     text: { body }
      //   })
      // });
      // return res.ok;

      return true; // Mocking true for the template
    } catch (err) {
      console.error('Error in CloudAPIWhatsAppProvider:', err);
      return false;
    }
  }
}

/**
 * Factory class to choose the provider based on environment variables
 */
export class WhatsAppService {
  private static instance: WhatsAppService;
  private provider: WhatsAppProvider;

  private constructor() {
    // Si tienes configurado un TOKEN de Whatsapp, usamos CloudAPI, si no, Mock.
    if (process.env.WHATSAPP_TOKEN) {
      this.provider = new CloudAPIWhatsAppProvider();
    } else {
      this.provider = new MockWhatsAppProvider();
    }
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  async sendReminder(to: string, body: string): Promise<boolean> {
    return this.provider.sendMessage(to, body);
  }
}
