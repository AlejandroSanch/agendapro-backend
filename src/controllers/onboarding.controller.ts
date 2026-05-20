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
import { getAuthUser } from '../utils/request';

export const OnboardingController = {
  getStatus: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const date = req.query.date as string | undefined;

    const completed = await getOnboardingStatus(user.id);
    const settings = await getBusinessSettings(user.id, date);

    res.json({ completed, settings, user });
  }),

  updateBusiness: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const data = patchBusinessSettingsSchema.parse(req.body);

    const settings = await upsertBusinessSettings(user.id, {
      businessType: data.businessType,
      phone: data.phone,
      address: data.address,
      street: data.street,
      extNumber: data.extNumber,
      intNumber: data.intNumber,
      neighborhood: data.neighborhood,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      logoUrl: data.logoUrl,
      schedules: data.schedules as any,
      breakEnabled: data.breakEnabled,
      breakStart: data.breakStart,
      breakEnd: data.breakEnd,
    });

    res.json({ settings });
  }),

  updateServices: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const data = onboardingServicesSchema.parse(req.body);
    const created = [];

    for (const svc of data.services) {
      const record = await createService(user.id, {
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
    const user = getAuthUser(req);

    const data = onboardingStaffSchema.parse(req.body);
    const created = [];

    for (const member of data.staff) {
      const record = await createStaffMember(user.id, {
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
    const user = getAuthUser(req);

    const data = onboardingPlanSchema.parse(req.body);

    const updatedUser = await setUserPlan(user.id, data.plan as any);
    if (!updatedUser) throw new ApiError(404, 'Usuario no encontrado.');

    res.json({ user: updatedUser });
  }),

  completeOnboarding: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    await setOnboardingCompleted(user.id);
    res.json({ completed: true });
  }),
};
