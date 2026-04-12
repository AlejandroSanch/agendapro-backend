import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { UsersController } from '../controllers/users.controller';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, UsersController.getMe);
usersRouter.get('/me/module-overrides', requireAuth, UsersController.getModuleOverrides);
usersRouter.put('/me/module-overrides/:moduleId', requireAuth, UsersController.setModuleOverride);
usersRouter.delete('/me/module-overrides/:moduleId', requireAuth, UsersController.clearModuleOverride);
usersRouter.patch('/me/plan', requireAuth, UsersController.updatePlan);
