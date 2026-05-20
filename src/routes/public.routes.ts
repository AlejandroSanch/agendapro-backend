import { Router } from 'express';
import {
  confirmAppointmentPublic,
  confirmAppointmentPublicGet,
  getAppointmentPublicDetails,
} from '../controllers/public.controller';
import { globalLimiter, authLimiter } from '../middleware/rate-limit';

const router = Router();

// Rutas públicas para el flujo de WhatsApp y Email
router.get('/appointments/:id', globalLimiter, getAppointmentPublicDetails);
router.post('/appointments/:id/confirm', authLimiter, confirmAppointmentPublic);
router.get('/appointments/:id/confirm', authLimiter, confirmAppointmentPublicGet); // Confirmación desde email (GET)

export { router as publicRouter };
