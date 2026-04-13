import { Request, Response } from 'express';
import { clearModuleOverride, getModuleOverrides, setModuleOverride, setUserPlan } from '../data/repositories/user.repository';
import { moduleIdParamSchema, setModuleOverrideSchema, updatePlanSchema } from '../validators/users.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

export const UsersController = {
  getMe: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    res.json({ user: req.user });
  }),

  getModuleOverrides: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const overrides = await getModuleOverrides(req.user.id);
    res.json({ overrides });
  }),

  setModuleOverride: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const paramData = moduleIdParamSchema.parse(req.params);
    const bodyData = setModuleOverrideSchema.parse(req.body);

    const overrides = await setModuleOverride(req.user.id, paramData.moduleId as any, bodyData.enabled);
    res.json({ overrides });
  }),

  clearModuleOverride: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const paramData = moduleIdParamSchema.parse(req.params);
    const overrides = await clearModuleOverride(req.user.id, paramData.moduleId as any);
    res.json({ overrides });
  }),

  updatePlan: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const data = updatePlanSchema.parse(req.body);
    const user = await setUserPlan(req.user.id, data.plan as any);
    
    if (!user) throw new ApiError(404, 'Usuario no encontrado.');

    req.user = user;
    res.json({ user });
  })
};
