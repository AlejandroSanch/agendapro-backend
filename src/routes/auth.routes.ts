import { Router } from 'express';
import { PLANS } from '../constants/catalog';
import { createUser, findUserByEmail, sanitizeUser, verifyPassword } from '../data/store';
import { issueAccessToken, requireAuth } from '../middleware/auth';
import { PlanId } from '../types';

export const authRouter = Router();
const validPlanIds = new Set<PlanId>(PLANS.map((plan) => plan.id));

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    res.status(400).json({ error: 'Completa todos los campos.' });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    res.status(401).json({ error: 'Credenciales invalidas.' });
    return;
  }

  const accessToken = issueAccessToken(user.id, user.email);
  res.json({
    accessToken,
    user: sanitizeUser(user),
  });
});

authRouter.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const businessName = String(req.body?.businessName || '').trim();
  const requestedPlan = (req.body?.plan as PlanId | undefined) ?? 'starter';

  if (!email || !password || !name || !businessName) {
    res.status(400).json({ error: 'Completa todos los campos.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Correo electronico invalido.' });
    return;
  }

  if (!isValidPassword(password)) {
    res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres.' });
    return;
  }

  if (!validPlanIds.has(requestedPlan)) {
    res.status(400).json({ error: 'Plan invalido.' });
    return;
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    return;
  }

  const user = await createUser({
    email,
    password,
    name,
    businessName,
    plan: requestedPlan,
  });

  if (!user) {
    res.status(409).json({ error: 'Ya existe un usuario con ese correo.' });
    return;
  }

  const accessToken = issueAccessToken(user.id, user.email);
  res.status(201).json({
    accessToken,
    user: sanitizeUser(user),
  });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ user: _req.user });
});
