import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { findUserById, sanitizeUser } from '../data/repositories/user.repository';

interface AuthTokenPayload {
  sub: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
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
  let token = '';
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    token = authorization.slice('Bearer '.length).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Token requerido.' });
    return;
  }

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
