import request from 'supertest';
import { app } from '../index';
import * as settingsRepository from '../data/repositories/settings.repository';
import * as serviceRepository from '../data/repositories/service.repository';
import * as userRepository from '../data/repositories/user.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/settings.repository');
jest.mock('../data/repositories/service.repository');
jest.mock('../data/repositories/user.repository');

jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', plan: 'starter' };
    next();
  }),
}));

describe('OnboardingController (Integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('GET /api/onboarding/status', () => {
    it('debería retornar el estado de onboarding', async () => {
      (settingsRepository.getOnboardingStatus as jest.Mock).mockResolvedValue(false);
      (settingsRepository.getBusinessSettings as jest.Mock).mockResolvedValue({ businessName: 'Test' });

      const response = await request(app).get('/api/onboarding/status');

      expect(response.status).toBe(200);
      expect(response.body.completed).toBe(false);
      expect(response.body.settings.businessName).toBe('Test');
    });
  });

  describe('POST /api/onboarding/business', () => {
    it('debería actualizar la configuración del negocio', async () => {
      (settingsRepository.upsertBusinessSettings as jest.Mock).mockResolvedValue({ phone: '123' });

      const response = await request(app)
        .patch('/api/onboarding/business')
        .send({ phone: '123', schedules: [] });

      expect(response.status).toBe(200);
      expect(response.body.settings.phone).toBe('123');
    });
  });

  describe('POST /api/onboarding/services', () => {
    it('debería crear múltiples servicios', async () => {
      (serviceRepository.createService as jest.Mock).mockResolvedValue({ id: 's1', name: 'Svc 1' });

      const response = await request(app)
        .post('/api/onboarding/services')
        .send({
          services: [
            { name: 'Svc 1', durationMin: 30, priceCents: 10, category: 'G' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.created).toHaveLength(1);
    });
  });

  describe('POST /api/onboarding/complete', () => {
    it('debería marcar onboarding como completado', async () => {
      (settingsRepository.setOnboardingCompleted as jest.Mock).mockResolvedValue(true);

      const response = await request(app).post('/api/onboarding/complete');

      expect(response.status).toBe(200);
      expect(response.body.completed).toBe(true);
    });
  });
});
