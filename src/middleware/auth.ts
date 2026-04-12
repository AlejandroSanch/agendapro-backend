import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { findUserById, sanitizeUser } from '../data/repositories/user.repository';

interface AuthTokenPayload {
  sub: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: ReturnType<typeof sanitizeUser>;
    }
  }
}

export function issueAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, env.jwtSecret, { expiresIn: '7d' });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido.' });
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado.' });
      return;
    }

    req.user = sanitizeUser(user);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o expirado.' });
  }
}
