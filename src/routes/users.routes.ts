import { Router } from 'express';
import { ALL_MODULES } from '../constants/catalog';
import { clearModuleOverride, getModuleOverrides, setModuleOverride } from '../data/store';
import { requireAuth } from '../middleware/auth';
import { ModuleId } from '../types';

const validModuleIds = new Set<ModuleId>(ALL_MODULES.map((module) => module.id));

function parseModuleId(raw: string): ModuleId | null {
  const moduleId = raw as ModuleId;
  return validModuleIds.has(moduleId) ? moduleId : null;
}

export const usersRouter = Router();

usersRouter.get('/me/module-overrides', requireAuth, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  res.json({ overrides: getModuleOverrides(req.user.id) });
});

usersRouter.put('/me/module-overrides/:moduleId', requireAuth, (req, res) => {
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

  const overrides = setModuleOverride(req.user.id, moduleId, enabled);
  res.json({ overrides });
});

usersRouter.delete('/me/module-overrides/:moduleId', requireAuth, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const moduleId = parseModuleId(req.params.moduleId);
  if (!moduleId) {
    res.status(400).json({ error: 'Modulo invalido.' });
    return;
  }

  const overrides = clearModuleOverride(req.user.id, moduleId);
  res.json({ overrides });
});
