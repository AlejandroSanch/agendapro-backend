import { Request, Response } from 'express';
import {
  getOnboardingStatus,
  setOnboardingCompleted,
  getBusinessSettings,
  upsertBusinessSettings,
  createStaffMember,
} from '../data/repositories/settings.repository';
import { createService } from '../data/repositories/service.repository';
import { setUserPlan } from '../data/repositories/user.repository';
import {
  onboardingPlanSchema,
  onboardingServicesSchema,
  onboardingStaffSchema,
  patchBusinessSettingsSchema,
} from '../validators/onboarding.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

export const OnboardingController = {
  getStatus: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const completed = await getOnboardingStatus(req.user.id);
    const settings  = await getBusinessSettings(req.user.id);

    res.json({ completed, settings, user: req.user });
  }),

  updateBusiness: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = patchBusinessSettingsSchema.parse(req.body);

    const settings = await upsertBusinessSettings(req.user.id, {
      businessType: data.businessType,
      phone:        data.phone,
      address:      data.address,
      logoUrl:      data.logoUrl,
      schedules:    data.schedules as any,
    });

    res.json({ settings });
  }),

  updateServices: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = onboardingServicesSchema.parse(req.body);
    const created = [];

    for (const svc of data.services) {
      const record = await createService(req.user.id, {
        name: svc.name,
        durationMin: svc.durationMin,
        priceCents: Math.round(svc.priceCents * 100),
        category: svc.category,
        isActive: true,
      });

      if (record) created.push(record);
    }

    res.json({ created });
  }),

  updateStaff: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = onboardingStaffSchema.parse(req.body);
    const created = [];

    for (const member of data.staff) {
      const record = await createStaffMember(req.user.id, {
        fullName: member.fullName,
        email: member.email || undefined,
        phone: member.phone || undefined,
        role: member.role,
        specialties: member.specialties,
      });

      if (record) created.push(record);
    }

    res.json({ created });
  }),

  updatePlan: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = onboardingPlanSchema.parse(req.body);
    
    const user = await setUserPlan(req.user.id, data.plan as any);
    if (!user) throw new ApiError(404, 'Usuario no encontrado.');

    res.json({ user });
  }),

  completeOnboarding: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    await setOnboardingCompleted(req.user.id);
    res.json({ completed: true });
  })
};
