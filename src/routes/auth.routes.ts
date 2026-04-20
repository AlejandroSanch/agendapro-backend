import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { AuthController } from '../controllers/auth.controller';
import { authLimiter } from '../middleware/rate-limit';

export const authRouter = Router();

authRouter.post('/login', authLimiter, AuthController.login);
authRouter.post('/register', authLimiter, AuthController.register);
authRouter.post('/verify-email', AuthController.verifyEmail);
authRouter.post('/resend-verification', AuthController.resendVerification);
authRouter.get('/me', requireAuth, AuthController.getMe);
