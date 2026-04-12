import { z } from 'zod';
import { ALL_MODULES, PLANS } from '../constants/catalog';

const validModuleIds = ALL_MODULES.map(m => m.id) as [string, ...string[]];
const validPlanIds = PLANS.map(p => p.id) as [string, ...string[]];

export const setModuleOverrideSchema = z.object({
  enabled: z.boolean({ error: "enabled debe ser boolean." })
});

export const moduleIdParamSchema = z.object({
  moduleId: z.enum(validModuleIds, { message: "Módulo inválido." })
});

export const updatePlanSchema = z.object({
  plan: z.enum(validPlanIds, { message: "Plan inválido." })
});
