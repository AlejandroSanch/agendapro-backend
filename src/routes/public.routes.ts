import { Router } from 'express';
import { confirmAppointmentPublic, getAppointmentPublicDetails } from '../controllers/public.controller';

const router = Router();

// Rutas públicas para el flujo de WhatsApp
router.get('/appointments/:id', getAppointmentPublicDetails);
router.post('/appointments/:id/confirm', confirmAppointmentPublic);

export { router as publicRouter };
