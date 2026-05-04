import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { IntegrationsController } from '../controllers/integrations.controller';

export const integrationsRouter = Router();

integrationsRouter.get('/google/auth', requireAuth, IntegrationsController.getGoogleAuthUrl);
integrationsRouter.get('/google/callback', IntegrationsController.googleCallback);
