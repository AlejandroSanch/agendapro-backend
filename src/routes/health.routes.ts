import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'agendapro-backend',
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/test-whatsapp', async (req, res) => {
  try {
    const { to } = req.query;
    if (!to)
      return res.status(400).json({ error: 'Falta el numero "to" en la query (ej: ?to=521...)' });

    const result = await WhatsAppService.sendAppointmentReminder(
      to as string,
      'Cliente de Prueba',
      'Hoy',
      '17:00',
    );
    res.json({ success: true, message: 'WhatsApp enviado!', result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
