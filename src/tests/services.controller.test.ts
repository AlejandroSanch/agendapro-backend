import request from 'supertest';
import { app } from '../index';
import * as serviceRepository from '../data/repositories/service.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/service.repository');

jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', name: 'Test' };
    next();
  }),
}));

describe('ServicesController (Integration)', () => {
  const mockService = {
    id: 's1',
    name: 'Corte de Cabello',
    category: 'Estilismo',
    durationMin: 30,
    priceCents: 1500,
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('GET /api/services', () => {
    it('debería listar servicios', async () => {
      (serviceRepository.listServices as jest.Mock).mockResolvedValue({
        data: [mockService],
        total: 1
      });

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0].nombre).toBe('Corte de Cabello');
    });
  });

  describe('POST /api/services', () => {
    it('debería crear un servicio', async () => {
      (serviceRepository.createService as jest.Mock).mockResolvedValue(mockService);

      const response = await request(app)
        .post('/api/services')
        .send({
          nombre: 'Corte de Cabello',
          categoria: 'Estilismo',
          duracionMin: 30,
          precio: 15
        });

      expect(response.status).toBe(201);
      expect(response.body.service.id).toBe('s1');
    });

    it('debería fallar si el nombre está duplicado', async () => {
      const dbError = new Error('Duplicate entry');
      (dbError as any).code = 'ER_DUP_ENTRY';
      (dbError as any).sqlMessage = 'uniq_services_name';
      (serviceRepository.createService as jest.Mock).mockRejectedValue(dbError);

      const response = await request(app)
        .post('/api/services')
        .send({
          nombre: 'Duplicado',
          categoria: 'G',
          duracionMin: 30,
          precio: 10
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('existe un servicio');
    });
  });

  describe('DELETE /api/services/:id', () => {
    it('debería borrar un servicio si no tiene citas activas', async () => {
      (serviceRepository.hasActiveAppointments as jest.Mock).mockResolvedValue(false);
      (serviceRepository.deleteService as jest.Mock).mockResolvedValue(true);

      const response = await request(app).delete('/api/services/s1');

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('debería fallar si tiene citas activas', async () => {
      (serviceRepository.hasActiveAppointments as jest.Mock).mockResolvedValue(true);

      const response = await request(app).delete('/api/services/s1');

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('citas próximas');
    });
  });
});
