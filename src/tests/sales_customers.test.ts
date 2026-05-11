import request from 'supertest';
import { app } from '../index';
import * as saleRepository from '../data/repositories/sale.repository';
import * as customerRepository from '../data/repositories/customer.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/sale.repository');
jest.mock('../data/repositories/customer.repository');

jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', name: 'Test' };
    next();
  }),
}));

describe('Sales & Customers Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('SalesController', () => {
    it('debería procesar un checkout exitoso', async () => {
      (saleRepository.createSale as jest.Mock).mockResolvedValue('sale_123');

      const response = await request(app)
        .post('/api/sales/checkout')
        .send({
          clienteId: 'c1',
          items: [{ tipo: 'product', id: 'p1', cantidad: 1, precioUnitario: 10 }],
          pagos: [{ metodo: 'cash', monto: 10 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.saleId).toBe('sale_123');
    });
  });

  describe('CustomersController', () => {
    const mockCustomer = { id: 'c1', nombre: 'Juan' };

    it('debería listar clientes', async () => {
      (customerRepository.listCustomers as jest.Mock).mockResolvedValue({
        data: [mockCustomer],
        total: 1,
      });

      const response = await request(app).get('/api/customers');

      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(1);
    });

    it('debería crear un cliente', async () => {
      (customerRepository.createCustomer as jest.Mock).mockResolvedValue(mockCustomer);

      const response = await request(app)
        .post('/api/customers')
        .send({ nombre: 'Juan', telefono: '123' });

      expect(response.status).toBe(201);
      expect(response.body.customer.nombre).toBe('Juan');
    });

    it('debería devolver 404 si el cliente no existe al buscar por ID', async () => {
      (customerRepository.getCustomerById as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get('/api/customers/nonexistent');

      expect(response.status).toBe(404);
    });
  });
});
