import { Router } from 'express';
import { createOrGetDemoUser, findUserByEmail, sanitizeUser, verifyPassword } from '../data/store';
import { issueAccessToken, requireAuth } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Completa todos los campos.' });
    return;
  }

  const existingUser = findUserByEmail(email);
  const user = existingUser ?? createOrGetDemoUser(email, password);

  if (existingUser && !verifyPassword(existingUser, password)) {
    res.status(401).json({ error: 'Credenciales invalidas.' });
    return;
  }

  const accessToken = issueAccessToken(user.id, user.email);
  res.json({
    accessToken,
    user: sanitizeUser(user),
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
