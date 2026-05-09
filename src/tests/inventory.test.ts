import { listInventoryLogs, adjustStock } from '../data/repositories/inventory.repository';
import { getControlPool } from '../data/db';
import { getTenantDbNameByUserId } from '../data/repositories/user.repository';

jest.mock('../data/db');
jest.mock('../data/repositories/user.repository');

describe('InventoryRepository', () => {
  const userId = 'user123';
  const tenantDb = 'tenant_test';
  const mockQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantDbNameByUserId as jest.Mock).mockResolvedValue(tenantDb);
    (getControlPool as jest.Mock).mockReturnValue({
      query: mockQuery,
    });
  });

  describe('listInventoryLogs', () => {
    it('debería listar los logs de inventario mapeados correctamente', async () => {
      // 1. Count query mock
      mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);
      // 2. Data query mock
      mockQuery.mockResolvedValueOnce([[
        {
          id: 1,
          product_id: 10,
          product_name: 'Shampoo',
          type: 'in',
          quantity: 5,
          stock_before: 10,
          stock_after: 15,
          notes: 'Compra proveedor',
          staff_id: null,
          created_at: '2026-05-08 12:00:00'
        }
      ]]);

      const { data, total } = await listInventoryLogs(userId);

      expect(data).toHaveLength(1);
      expect(total).toBe(1);
      expect(data[0]!).toEqual(expect.objectContaining({
        id: '1',
        productName: 'Shampoo',
        quantity: 5,
        stockAfter: 15
      }));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM `tenant_test`.inventory_logs'));
    });
  });

  describe('adjustStock', () => {
    const productId = '10';

    it('debería incrementar stock con tipo "in"', async () => {
      // 1. Obtener stock actual (10)
      mockQuery.mockResolvedValueOnce([[{ stock_quantity: 10 }]]);
      // 2. Actualizar stock (10 + 5 = 15)
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 3. Insertar log
      mockQuery.mockResolvedValueOnce([{ insertId: 500 }]);

      const result = await adjustStock(userId, {
        productId,
        type: 'in',
        quantity: 5,
        notes: 'Nueva carga'
      });

      expect(result?.stockAfter).toBe(15);
      expect(result?.quantity).toBe(5);
      
      // Verificar UPDATE de stock
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `tenant_test`.products SET stock_quantity = ?'),
        [15, productId]
      );
      
      // Verificar INSERT de log
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `tenant_test`.inventory_logs'),
        expect.arrayContaining([productId, 'in', 5, 10, 15])
      );
    });

    it('debería decrementar stock con tipo "out"', async () => {
      mockQuery.mockResolvedValueOnce([[{ stock_quantity: 20 }]]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([{ insertId: 501 }]);

      const result = await adjustStock(userId, {
        productId,
        type: 'out',
        quantity: 3
      });

      expect(result?.stockAfter).toBe(17);
      expect(result?.quantity).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `tenant_test`.products SET stock_quantity = ?'),
        [17, productId]
      );
    });

    it('debería sobreescribir stock con tipo "adjustment" y calcular cantidad relativa para el log', async () => {
      // Stock actual 10, ajustamos a 25. Cantidad relativa = +15.
      mockQuery.mockResolvedValueOnce([[{ stock_quantity: 10 }]]);
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([{ insertId: 502 }]);

      const result = await adjustStock(userId, {
        productId,
        type: 'adjustment',
        quantity: 25 // En ajuste, quantity es el nuevo total
      });

      expect(result?.stockAfter).toBe(25);
      expect(result?.quantity).toBe(15); // 25 - 10
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `tenant_test`.products SET stock_quantity = ?'),
        [25, productId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `tenant_test`.inventory_logs'),
        expect.arrayContaining([productId, 'adjustment', 15, 10, 25])
      );
    });

    it('debería retornar null si el producto no existe', async () => {
      mockQuery.mockResolvedValueOnce([[]]);

      const result = await adjustStock(userId, {
        productId: '999',
        type: 'in',
        quantity: 1
      });

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE'), expect.anything());
    });
  });
});
