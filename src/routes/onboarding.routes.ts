import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { OnboardingController } from '../controllers/onboarding.controller';

export const onboardingRouter = Router();

onboardingRouter.get('/status', requireAuth, OnboardingController.getStatus);
onboardingRouter.patch('/business', requireAuth, OnboardingController.updateBusiness);
onboardingRouter.post('/services', requireAuth, OnboardingController.updateServices);
onboardingRouter.post('/staff', requireAuth, OnboardingController.updateStaff);
onboardingRouter.patch('/plan', requireAuth, OnboardingController.updatePlan);
onboardingRouter.post('/complete', requireAuth, OnboardingController.completeOnboarding);
