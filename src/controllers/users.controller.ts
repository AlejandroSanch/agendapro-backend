import { Request, Response } from 'express';
import {
  clearModuleOverride,
  getModuleOverrides,
  setModuleOverride,
  setUserPlan,
} from '../data/repositories/user.repository';
import {
  moduleIdParamSchema,
  setModuleOverrideSchema,
  updatePlanSchema,
} from '../validators/users.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';

export const UsersController = {
  getMe: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    res.json({ user });
  }),

  getModuleOverrides: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const overrides = await getModuleOverrides(user.id);
    res.json({ overrides });
  }),

  setModuleOverride: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const paramData = moduleIdParamSchema.parse(req.params);
    const bodyData = setModuleOverrideSchema.parse(req.body);

    const overrides = await setModuleOverride(user.id, paramData.moduleId, bodyData.enabled);
    res.json({ overrides });
  }),

  clearModuleOverride: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const paramData = moduleIdParamSchema.parse(req.params);
    const overrides = await clearModuleOverride(user.id, paramData.moduleId);
    res.json({ overrides });
  }),

  updatePlan: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = updatePlanSchema.parse(req.body);
    const updatedUser = await setUserPlan(user.id, data.plan);

    if (!updatedUser) throw new ApiError(404, 'Usuario no encontrado.');

    res.json({ user: updatedUser });
  }),
};
