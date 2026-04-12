import { Request, Response } from 'express';
import { z } from 'zod';
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

export const OnboardingController = {
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

      const completed = await getOnboardingStatus(req.user.id);
      const settings  = await getBusinessSettings(req.user.id);

      res.json({ completed, settings, user: req.user });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async updateBusiness(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

      const data = patchBusinessSettingsSchema.parse(req.body);

      const settings = await upsertBusinessSettings(req.user.id, {
        businessType: data.businessType,
        phone:        data.phone,
        address:      data.address,
        logoUrl:      data.logoUrl,
        schedules:    data.schedules as any,
      });

      res.json({ settings });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async updateServices(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

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
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async updateStaff(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

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
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

      const data = onboardingPlanSchema.parse(req.body);
      
      const user = await setUserPlan(req.user.id, data.plan as any);
      if (!user) { res.status(404).json({ error: 'Usuario no encontrado.' }); return; }

      res.json({ user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async completeOnboarding(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

      await setOnboardingCompleted(req.user.id);
      res.json({ completed: true });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
};
