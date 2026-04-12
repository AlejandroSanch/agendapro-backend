import { Request, Response } from 'express';
import { z } from 'zod';
import { clearModuleOverride, getModuleOverrides, setModuleOverride, setUserPlan } from '../data/repositories/user.repository';
import { moduleIdParamSchema, setModuleOverrideSchema, updatePlanSchema } from '../validators/users.validators';

export const UsersController = {
  getMe(req: Request, res: Response): void {
    if (!req.user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }
    res.json({ user: req.user });
  },

  async getModuleOverrides(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }
      const overrides = await getModuleOverrides(req.user.id);
      res.json({ overrides });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async setModuleOverride(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }
      
      const paramData = moduleIdParamSchema.parse(req.params);
      const bodyData = setModuleOverrideSchema.parse(req.body);

      const overrides = await setModuleOverride(req.user.id, paramData.moduleId as any, bodyData.enabled);
      res.json({ overrides });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async clearModuleOverride(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

      const paramData = moduleIdParamSchema.parse(req.params);
      const overrides = await clearModuleOverride(req.user.id, paramData.moduleId as any);
      res.json({ overrides });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async updatePlan(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

      const data = updatePlanSchema.parse(req.body);
      const user = await setUserPlan(req.user.id, data.plan as any);
      
      if (!user) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }

      req.user = user;
      res.json({ user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
};
