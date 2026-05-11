import request from 'supertest';
import { app } from '../index';
import * as staffRepository from '../data/repositories/staff.repository';
import * as categoryRepository from '../data/repositories/category.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/staff.repository');
jest.mock('../data/repositories/category.repository');

jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', name: 'Test' };
    next();
  }),
}));

describe('Staff & Categories Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('StaffController', () => {
    const mockStaff = { id: 'st1', name: 'Carlos' };

    it('debería listar personal', async () => {
      (staffRepository.listStaff as jest.Mock).mockResolvedValue([mockStaff]);

      const response = await request(app).get('/api/staff');

      expect(response.status).toBe(200);
      expect(response.body.staff).toHaveLength(1);
    });

    it('debería crear un miembro del staff', async () => {
      (staffRepository.createStaff as jest.Mock).mockResolvedValue(mockStaff);

      const response = await request(app)
        .post('/api/staff')
        .send({
          nombre: 'Carlos',
          rol: 'admin',
          especialidades: ['Corte'],
          activo: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.staffMember.name).toBe('Carlos');
    });

    it('debería fallar al borrar el último empleado', async () => {
      (staffRepository.listStaff as jest.Mock).mockResolvedValue([mockStaff]);

      const response = await request(app).delete('/api/staff/st1');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('al menos un empleado');
    });
  });

  describe('CategoriesController', () => {
    it('debería listar categorías', async () => {
      (categoryRepository.listCategories as jest.Mock).mockResolvedValue([
        { id: 'c1', name: 'General' },
      ]);

      const response = await request(app).get('/api/categories?type=service');

      expect(response.status).toBe(200);
      expect(response.body.categories).toHaveLength(1);
    });

    it('debería crear una categoría', async () => {
      (categoryRepository.createCategory as jest.Mock).mockResolvedValue({
        id: 'c1',
        name: 'Test',
      });

      const response = await request(app)
        .post('/api/categories')
        .send({ nombre: 'Test', type: 'product' });

      expect(response.status).toBe(201);
      expect(response.body.category.name).toBe('Test');
    });
  });
});
