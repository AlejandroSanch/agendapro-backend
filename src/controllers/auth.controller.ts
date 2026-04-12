import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createUser,
  findUserByEmail,
  refreshEmailVerificationTokenByEmail,
  sanitizeUser,
  verifyUserEmailByToken,
} from '../data/repositories/user.repository';
import { verifyPasswordPlain } from '../data/utils';
import { issueAccessToken } from '../middleware/auth';
import { env } from '../config/env';
import {
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  verificationTokenSchema,
} from '../validators/auth.validators';

function verificationPreview(token: string): { token: string; url: string } {
  const base = env.frontendBaseUrl.replace(/\/+$/, '');
  const encodedToken = encodeURIComponent(token);
  return {
    token,
    url: `${base}/verificar-email?token=${encodedToken}`,
  };
}

export const AuthController = {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const data = loginSchema.parse(req.body);

      const user = await findUserByEmail(data.email);
      if (!user || !verifyPasswordPlain(user.password, data.password)) {
        res.status(401).json({ error: 'Credenciales inválidas.' });
        return;
      }

      if (!user.emailVerified) {
        res.status(403).json({
          error: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
          requiresEmailVerification: true,
        });
        return;
      }

      const accessToken = issueAccessToken(user.id, user.email);
      res.json({
        accessToken,
        user: sanitizeUser(user),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async register(req: Request, res: Response): Promise<void> {
    try {
      const data = registerSchema.parse(req.body);

      const existing = await findUserByEmail(data.email);
      if (existing) {
        res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
        return;
      }

      const user = await createUser({
        email: data.email,
        password: data.password,
        name: data.name,
        businessName: data.businessName,
        acceptTerms: data.acceptTerms,
        plan: data.plan as any,
      });

      if (!user) {
        res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
        return;
      }

      const preview =
        user.emailVerificationToken && process.env.NODE_ENV !== 'production'
          ? verificationPreview(user.emailVerificationToken)
          : null;

      res.status(201).json({
        requiresEmailVerification: true,
        message: 'Cuenta creada. Revisa tu correo para verificar tu cuenta.',
        verificationPreview: preview,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const data = verificationTokenSchema.parse(req.body);

      const user = await verifyUserEmailByToken(data.token);
      if (!user) {
        res.status(400).json({ error: 'Token inválido o expirado.' });
        return;
      }

      const accessToken = issueAccessToken(user.id, user.email);
      res.json({
        accessToken,
        user: sanitizeUser(user),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const data = resendVerificationSchema.parse(req.body);

      const user = await findUserByEmail(data.email);
      if (!user) {
        res.json({ message: 'Si el correo existe, enviaremos un nuevo enlace de verificación.' });
        return;
      }

      if (user.emailVerified) {
        res.json({ message: 'Tu correo ya está verificado.' });
        return;
      }

      const token = await refreshEmailVerificationTokenByEmail(data.email);
      const preview =
        token && process.env.NODE_ENV !== 'production' ? verificationPreview(token) : null;

      res.json({
        message: 'Si el correo existe, enviaremos un nuevo enlace de verificación.',
        verificationPreview: preview,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  getMe(req: Request, res: Response): void {
    res.json({ user: req.user });
  },
};
