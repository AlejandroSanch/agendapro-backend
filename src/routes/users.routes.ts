import { Router } from 'express';
import { PLANS } from '../constants/catalog';
import { ALL_MODULES } from '../constants/catalog';
import { clearModuleOverride, getModuleOverrides, setModuleOverride, setUserPlan } from '../data/store';
import { requireAuth } from '../middleware/auth';
import { ModuleId, PlanId } from '../types';

const validModuleIds = new Set<ModuleId>(ALL_MODULES.map((module) => module.id));
const validPlanIds = new Set<PlanId>(PLANS.map((plan) => plan.id));

function parseModuleId(raw: string): ModuleId | null {
  const moduleId = raw as ModuleId;
  return validModuleIds.has(moduleId) ? moduleId : null;
}

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  res.json({ user: req.user });
});

usersRouter.get('/me/module-overrides', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const overrides = await getModuleOverrides(req.user.id);
  res.json({ overrides });
});

usersRouter.put('/me/module-overrides/:moduleId', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const moduleId = parseModuleId(req.params.moduleId);
  if (!moduleId) {
    res.status(400).json({ error: 'Modulo invalido.' });
    return;
  }

  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'enabled debe ser boolean.' });
    return;
  }

  const overrides = await setModuleOverride(req.user.id, moduleId, enabled);
  res.json({ overrides });
});

usersRouter.delete('/me/module-overrides/:moduleId', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const moduleId = parseModuleId(req.params.moduleId);
  if (!moduleId) {
    res.status(400).json({ error: 'Modulo invalido.' });
    return;
  }

  const overrides = await clearModuleOverride(req.user.id, moduleId);
  res.json({ overrides });
});

usersRouter.patch('/me/plan', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const requestedPlan = req.body?.plan as PlanId | undefined;
  if (!requestedPlan || !validPlanIds.has(requestedPlan)) {
    res.status(400).json({ error: 'Plan invalido.' });
    return;
  }

  const user = await setUserPlan(req.user.id, requestedPlan);
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }

  req.user = user;
  res.json({ user });
});
