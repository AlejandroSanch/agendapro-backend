import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getOnboardingStatus,
  setOnboardingCompleted,
  getBusinessSettings,
  upsertBusinessSettings,
  listStaff,
  createStaffMember,
} from '../data/store';
import { setUserPlan } from '../data/store';
import { createService } from '../data/store';
import { PLANS } from '../constants/catalog';
import { PlanId } from '../types';

const validPlanIds = new Set<PlanId>(PLANS.map((p) => p.id));

export const onboardingRouter = Router();

// GET /api/onboarding/status
onboardingRouter.get('/status', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  const completed = await getOnboardingStatus(req.user.id);
  const settings  = await getBusinessSettings(req.user.id);
  const user      = req.user;

  res.json({ completed, settings, user });
});

// PATCH /api/onboarding/business
onboardingRouter.patch('/business', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  const { businessType, phone, address, logoUrl, schedules } = req.body ?? {};

  const settings = await upsertBusinessSettings(req.user.id, {
    businessType: businessType ? String(businessType).trim() : undefined,
    phone:        phone        ? String(phone).trim()        : undefined,
    address:      address      ? String(address).trim()      : undefined,
    logoUrl:      logoUrl      ? String(logoUrl).trim()      : undefined,
    schedules:    Array.isArray(schedules) ? schedules       : undefined,
  });

  res.json({ settings });
});

// POST /api/onboarding/services
onboardingRouter.post('/services', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  const { services } = req.body ?? {};
  if (!Array.isArray(services) || services.length === 0) {
    res.status(400).json({ error: 'Envía al menos un servicio.' });
    return;
  }

  const created = [];
  for (const svc of services) {
    const name        = String(svc.name || '').trim();
    const durationMin = Math.max(1, Number(svc.durationMin || 30));
    const priceCents  = Math.max(0, Math.round(Number(svc.priceCents || 0)));
    const category    = String(svc.category || 'general').trim();

    if (!name) continue;

    const record = await createService(req.user.id, {
      name, durationMin, priceCents, category, isActive: true,
    });

    if (record) created.push(record);
  }

  res.json({ created });
});

// POST /api/onboarding/staff
onboardingRouter.post('/staff', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  const { staff } = req.body ?? {};
  if (!Array.isArray(staff) || staff.length === 0) {
    res.status(400).json({ error: 'Envía al menos un empleado.' });
    return;
  }

  const created = [];
  for (const member of staff) {
    const fullName    = String(member.fullName || '').trim();
    const email       = member.email       ? String(member.email).trim()  : undefined;
    const phone       = member.phone       ? String(member.phone).trim()  : undefined;
    const role        = member.role        ? String(member.role).trim()   : 'staff';
    const specialties = Array.isArray(member.specialties) ? member.specialties : [];

    if (!fullName) continue;

    const record = await createStaffMember(req.user.id, {
      fullName, email, phone, role, specialties,
    });

    if (record) created.push(record);
  }

  res.json({ created });
});

// PATCH /api/onboarding/plan
onboardingRouter.patch('/plan', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  const plan = req.body?.plan as PlanId | undefined;
  if (!plan || !validPlanIds.has(plan)) {
    res.status(400).json({ error: 'Plan invalido.' });
    return;
  }

  const user = await setUserPlan(req.user.id, plan);
  if (!user) { res.status(404).json({ error: 'Usuario no encontrado.' }); return; }

  res.json({ user });
});

// POST /api/onboarding/complete
onboardingRouter.post('/complete', requireAuth, async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }

  await setOnboardingCompleted(req.user.id);
  res.json({ completed: true });
});