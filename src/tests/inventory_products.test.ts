import request from 'supertest';
import { app } from '../index';
import * as productRepository from '../data/repositories/product.repository';
import * as inventoryRepository from '../data/repositories/inventory.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/product.repository');
jest.mock('../data/repositories/inventory.repository');

jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', name: 'Test' };
    next();
  }),
}));

describe('Inventory & Products Integration', () => {
  const mockProduct = {
    id: 'p123',
    name: 'Shampoo',
    sku: 'SH-001',
    unit: 'unid',
    priceCents: 1000,
    costCents: 500,
    stockQuantity: 10,
    reorderAlertLevel: 2,
    isActive: true,
    categoryId: 'c1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('ProductsController', () => {
    it('debería listar productos', async () => {
      (productRepository.listProducts as jest.Mock).mockResolvedValue({
        data: [mockProduct],
        total: 1,
      });

      const response = await request(app).get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body.products).toHaveLength(1);
      expect(response.body.products[0].nombre).toBe('Shampoo');
    });

    it('debería crear un producto', async () => {
      (productRepository.createProduct as jest.Mock).mockResolvedValue(mockProduct);

      const response = await request(app)
        .post('/api/products')
        .send({
          nombre: 'Shampoo',
          sku: 'SH-001',
          unidad: 'unid',
          precio: 10,
          costo: 5,
          stock: 10,
          alertaStock: 2,
          activo: true,
          categoriaId: 'c1'
        });

      expect(response.status).toBe(201);
      expect(response.body.product.id).toBe('p123');
    });

    it('debería borrar un producto', async () => {
      (productRepository.deleteProduct as jest.Mock).mockResolvedValue(true);

      const response = await request(app).delete('/api/products/p123');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('eliminado');
    });
  });

  describe('InventoryController', () => {
    it('debería registrar un movimiento de inventario', async () => {
      const mockLog = { id: 'log1', productId: 'p123', quantity: 5, type: 'in' };
      (inventoryRepository.adjustStock as jest.Mock).mockResolvedValue(mockLog);

      const response = await request(app)
        .post('/api/inventory/movements')
        .send({
          productId: 'p123',
          type: 'in',
          quantity: 5,
          notes: 'Compra de stock'
        });

      expect(response.status).toBe(201);
      expect(response.body.log.quantity).toBe(5);
    });

    it('debería listar los logs de inventario', async () => {
      (inventoryRepository.listInventoryLogs as jest.Mock).mockResolvedValue([{ id: 'log1' }]);

      const response = await request(app).get('/api/inventory/logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(1);
    });
  });
});
