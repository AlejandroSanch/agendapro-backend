import {
  listServices,
  createService,
  updateService,
  deleteService,
} from '../data/repositories/service.repository';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../data/repositories/category.repository';
import { getControlPool } from '../data/db';
import { getTenantDbNameByUserId } from '../data/repositories/user.repository';

jest.mock('../data/db');
jest.mock('../data/repositories/user.repository');

describe('Service & Category Repositories', () => {
  const userId = 'user123';
  const tenantDb = 'tenant_test';
  const mockQuery = jest.fn();
  const mockGetConnection = jest.fn();
  const mockConnection = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getTenantDbNameByUserId as jest.Mock).mockResolvedValue(tenantDb);
    (getControlPool as jest.Mock).mockReturnValue({
      query: mockQuery,
      getConnection: mockGetConnection,
    });
    mockGetConnection.mockResolvedValue(mockConnection);
  });

  describe('ServiceRepository', () => {
    it('debería listar servicios correctamente mapeando a ServiceRecord', async () => {
      // 1. Count query mock
      mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);
      // 2. Data query mock
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: '1',
            name: 'Corte de Cabello',
            category: 'Barbería',
            category_id: '10',
            description: 'Corte clásico',
            duration_minutes: 30,
            price_cents: 1500,
            display_order: 1,
            is_active: 1,
          },
        ],
      ]);

      const { data, total } = await listServices(userId);

      expect(data).toHaveLength(1);
      expect(total).toBe(1);
      expect(data[0]).toEqual({
        id: '1',
        name: 'Corte de Cabello',
        category: 'Barbería',
        categoryId: '10',
        description: 'Corte clásico',
        durationMin: 30,
        priceCents: 1500,
        displayOrder: 1,
        isActive: true,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/FROM\s+`tenant_test`\.services/i),
      );
    });

    it('debería crear un servicio auto-creando la categoría si no existe (con transacciones)', async () => {
      // 1. getNextServiceDisplayOrder
      mockConnection.query.mockResolvedValueOnce([[{ max_value: 5 }]]);
      // 2. Check category (no encontrada)
      mockConnection.query.mockResolvedValueOnce([[]]);
      // 3. Insert category
      mockConnection.query.mockResolvedValueOnce([{ insertId: 20 }]);
      // 4. Insert service
      mockConnection.query.mockResolvedValueOnce([{ insertId: 100 }]);
      // 5. getServiceById
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: '100',
            name: 'Tinte',
            category: 'Color',
            category_id: '20',
            duration_minutes: 60,
            price_cents: 5000,
            display_order: 6,
            is_active: 1,
          },
        ],
      ]);

      const service = await createService(userId, {
        name: 'Tinte',
        category: 'Color',
        durationMin: 60,
        priceCents: 5000,
      });

      expect(service?.id).toBe('100');
      expect(mockConnection.beginTransaction).toHaveBeenCalled();

      // Verificar que se buscó la categoría correctamente
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM `tenant_test`.categories'),
        expect.arrayContaining(['Color']),
      );

      // Verificar la inserción del servicio
      expect(mockConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `tenant_test`.services'),
        expect.arrayContaining(['Tinte', '20', '', 60, 5000, 6, 1]),
      );

      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('debería actualizar un servicio y resolver categoría existente', async () => {
      // 1. getServiceById (obtener actual)
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: '100',
            name: 'Tinte',
            category: 'Color',
            category_id: '20',
            duration_minutes: 60,
            price_cents: 5000,
            display_order: 6,
            is_active: 1,
          },
        ],
      ]);
      // 2. Buscar nueva categoría
      mockQuery.mockResolvedValueOnce([[{ id: '30' }]]);
      // 3. Update service
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 4. getServiceById (post-update)
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: '100',
            name: 'Tinte Plus',
            category: 'Premium',
            category_id: '30',
            duration_minutes: 90,
            price_cents: 7000,
            display_order: 6,
            is_active: 1,
          },
        ],
      ]);

      const updated = await updateService(userId, '100', {
        name: 'Tinte Plus',
        category: 'Premium',
        durationMin: 90,
        priceCents: 7000,
      });

      expect(updated?.name).toBe('Tinte Plus');
      expect(updated?.categoryId).toBe('30');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(
          /UPDATE\s+`tenant_test`\.services\s+SET\s+name\s+=\s+\?,\s+category_id\s+=\s+\?/,
        ),
        expect.arrayContaining(['Tinte Plus', '30', '', 90, 7000, 6, 1, '100']),
      );
    });

    it('debería realizar un soft delete del servicio correctamente', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await deleteService(userId, '100');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `tenant_test`.services'),
        expect.anything(),
      );
      expect(mockQuery.mock.calls[0][0]).toContain('deleted_at = NOW()');
    });
  });

  describe('CategoryRepository', () => {
    it('debería listar categorías por tipo', async () => {
      mockQuery.mockResolvedValueOnce([
        [{ id: '10', name: 'Barbería', description: 'Servicios de cabello', type: 'service' }],
      ]);

      const categories = await listCategories(userId, 'service');

      expect(categories).toHaveLength(1);
      expect(categories[0]!.name).toBe('Barbería');
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE type = ?'), [
        'service',
      ]);
    });

    it('debería crear una categoría correctamente', async () => {
      mockQuery.mockResolvedValueOnce([{ insertId: 50 }]);
      mockQuery.mockResolvedValueOnce([
        [{ id: '50', name: 'Spa', description: 'Relax', type: 'service' }],
      ]);

      const category = await createCategory(userId, {
        name: 'Spa',
        description: 'Relax',
        type: 'service',
      });

      expect(category?.name).toBe('Spa');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO `tenant_test`.categories'),
        ['Spa', 'Relax', 'service'],
      );
    });

    it('debería actualizar una categoría correctamente', async () => {
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockQuery.mockResolvedValueOnce([
        [{ id: '50', name: 'Spa Deluxe', description: 'Ultra relax', type: 'service' }],
      ]);

      const updated = await updateCategory(userId, '50', {
        name: 'Spa Deluxe',
        description: 'Ultra relax',
      });

      expect(updated?.name).toBe('Spa Deluxe');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE `tenant_test`.categories SET name = ?, description = ?'),
        ['Spa Deluxe', 'Ultra relax', '50'],
      );
    });

    it('debería lanzar error al intentar eliminar categoría con servicios asociados', async () => {
      // 1. Verificar servicios (tiene 1)
      mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);

      await expect(deleteCategory(userId, '10')).rejects.toThrow(
        'No se puede eliminar la categoría porque tiene servicios asociados.',
      );
    });

    it('debería lanzar error al intentar eliminar categoría con productos asociados', async () => {
      // 1. Verificar servicios (0)
      mockQuery.mockResolvedValueOnce([[{ total: 0 }]]);
      // 2. Verificar productos (tiene 1)
      mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);

      await expect(deleteCategory(userId, '10')).rejects.toThrow(
        'No se puede eliminar la categoría porque tiene productos asociados.',
      );
    });

    it('debería permitir eliminar categoría si no tiene dependencias', async () => {
      // 1. Verificar servicios (0)
      mockQuery.mockResolvedValueOnce([[{ total: 0 }]]);
      // 2. Verificar productos (0)
      mockQuery.mockResolvedValueOnce([[{ total: 0 }]]);
      // 3. Ejecutar DELETE
      mockQuery.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const result = await deleteCategory(userId, '10');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE\s+FROM\s+`tenant_test`\.categories/),
        expect.anything(),
      );
    });
  });
});
