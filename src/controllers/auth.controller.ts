import { Request, Response } from 'express';
import {
  createUser,
  findUserByEmail,
  findUserById,
  refreshEmailVerificationTokenByEmail,
  sanitizeUser,
  verifyUserEmailByToken,
} from '../data/repositories/user.repository';
import { verifyPasswordPlain } from '../data/utils';
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { env } from '../config/env';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  verificationTokenSchema,
} from '../validators/auth.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { sendMail } from '../utils/mailer';
import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
  buildVerificationUrl,
} from '../templates/verification-email.template';

function verificationPreview(token: string): { token: string; url: string } {
  return {
    token,
    url: buildVerificationUrl(token),
  };
}

/**
 * Envía el correo de verificación de forma asíncrona (fire-and-forget).
 * No bloquea la respuesta HTTP.
 */
function sendVerificationEmail(email: string, userName: string, token: string): void {
  const verificationUrl = buildVerificationUrl(token);
  const html = buildVerificationEmailHtml({ userName, verificationUrl });
  const text = buildVerificationEmailText({ userName, verificationUrl });

  sendMail(email, 'Verifica tu correo - AgendaPro', text, html).catch((err) => {
    console.error(`❌ Error enviando correo de verificación a ${email}:`, err);
  });
}

export const AuthController = {
  login: asyncWrapper(async (req: Request, res: Response) => {
    const data = loginSchema.parse(req.body);

    const user = await findUserByEmail(data.email);
    if (!user || !verifyPasswordPlain(user.password, data.password)) {
      throw new ApiError(401, 'Credenciales inválidas.');
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Debes verificar tu correo electrónico antes de iniciar sesión.',
        requiresEmailVerification: true,
      });
      return;
    }

    const accessToken = issueAccessToken(user.id, user.email);
    const refreshToken = issueRefreshToken(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  }),

  register: asyncWrapper(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);

    const existing = await findUserByEmail(data.email);
    if (existing) {
      throw new ApiError(409, 'Ya existe un usuario con ese correo.');
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
      throw new ApiError(409, 'Ya existe un usuario con ese correo.');
    }

    // Enviar correo de verificación (fire-and-forget)
    if (user.emailVerificationToken) {
      sendVerificationEmail(user.email, user.name, user.emailVerificationToken);
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
  }),

  verifyEmail: asyncWrapper(async (req: Request, res: Response) => {
    const data = verificationTokenSchema.parse(req.body);

    const user = await verifyUserEmailByToken(data.token);
    if (!user) {
      throw new ApiError(400, 'Token inválido o expirado.');
    }

    const accessToken = issueAccessToken(user.id, user.email);
    const refreshToken = issueRefreshToken(user.id);

    res.json({
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
    });
  }),

  resendVerification: asyncWrapper(async (req: Request, res: Response) => {
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

    // Enviar correo de verificación (fire-and-forget)
    if (token && user) {
      sendVerificationEmail(user.email, user.name, token);
    }

    const preview =
      token && process.env.NODE_ENV !== 'production' ? verificationPreview(token) : null;

    res.json({
      message: 'Si el correo existe, enviaremos un nuevo enlace de verificación.',
      verificationPreview: preview,
    });
  }),

  getMe: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    res.json({ user: req.user });
  }),

  refreshTokens: asyncWrapper(async (req: Request, res: Response) => {
    const data = refreshTokenSchema.parse(req.body);

    try {
      const payload = verifyRefreshToken(data.refreshToken);
      const user = await findUserById(payload.sub);

      if (!user) {
        throw new ApiError(401, 'Usuario no encontrado.');
      }

      const accessToken = issueAccessToken(user.id, user.email);
      const refreshToken = issueRefreshToken(user.id);

      res.json({
        accessToken,
        refreshToken,
      });
    } catch {
      throw new ApiError(401, 'Refresh token inválido o expirado.');
    }
  }),
};
