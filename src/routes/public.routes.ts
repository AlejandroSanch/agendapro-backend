import { Router } from 'express';
import {
  confirmAppointmentPublic,
  confirmAppointmentPublicGet,
  getAppointmentPublicDetails,
} from '../controllers/public.controller';

const router = Router();

// Rutas públicas para el flujo de WhatsApp y Email
router.get('/appointments/:id', getAppointmentPublicDetails);
router.post('/appointments/:id/confirm', confirmAppointmentPublic);
router.get('/appointments/:id/confirm', confirmAppointmentPublicGet); // Confirmación desde email (GET)

export { router as publicRouter };
