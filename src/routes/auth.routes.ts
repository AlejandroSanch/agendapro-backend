import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { AuthController } from '../controllers/auth.controller';

export const authRouter = Router();

authRouter.post('/login', AuthController.login);
authRouter.post('/register', AuthController.register);
authRouter.post('/verify-email', AuthController.verifyEmail);
authRouter.post('/resend-verification', AuthController.resendVerification);
authRouter.get('/me', requireAuth, AuthController.getMe);
