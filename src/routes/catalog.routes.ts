import { Router } from 'express';
import { ALL_MODULES, getPlanModules, PLANS } from '../constants/catalog';
import { getModuleOverrides } from '../data/store';
import { requireAuth } from '../middleware/auth';
import { ModuleId } from '../types';

export const catalogRouter = Router();

catalogRouter.get('/plans', (_req, res) => {
  res.json({ plans: PLANS });
});

catalogRouter.get('/modules', (_req, res) => {
  res.json({ modules: ALL_MODULES });
});

catalogRouter.get('/active-modules', requireAuth, (req, res) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const planModules = getPlanModules(user.plan);
  const overrides = getModuleOverrides(user.id);

  const activeModules = ALL_MODULES.map((module) => module.id as ModuleId).filter((moduleId) => {
    if (overrides[moduleId] === true) return true;
    if (overrides[moduleId] === false) return false;
    return planModules.includes(moduleId);
  });

  res.json({ activeModules });
});
