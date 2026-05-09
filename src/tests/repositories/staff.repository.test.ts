import { 
  listStaff, 
  createStaff, 
  updateStaff, 
  toggleStaffActive 
} from '../../data/repositories/staff.repository';
import { getControlPool } from '../../data/db';
import { getTenantDbNameByUserId } from '../../data/repositories/user.repository';

jest.mock('../../data/db');
jest.mock('../../data/repositories/user.repository');

describe('StaffRepository', () => {
  const userId = 'u1';
  const tenantDb = 'tenant_u1';
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

  describe('listStaff', () => {
    it('debería listar empleados con sus especialidades y horario', async () => {
      // 1. SELECT staff
      mockQuery.mockResolvedValueOnce([[
        { id: 'st1', first_name: 'Carlos', last_name: 'Perez', role_name: 'admin', is_active: 1 }
      ]]);
      // 2. getStaffEspecialidades
      mockQuery.mockResolvedValueOnce([[{ service_name: 'Corte' }]]);
      // 3. getStaffSchedule
      mockQuery.mockResolvedValueOnce([[{ day_of_week: 1, start_time: '09:00:00', end_time: '18:00:00' }]]);

      const result = await listStaff(userId);

      expect(result).toHaveLength(1);
      expect(result[0]!.nombre).toBe('Carlos Perez');
      expect(result[0]!.especialidades).toContain('Corte');
    });
  });

  describe('createStaff', () => {
    it('debería crear un empleado exitosamente', async () => {
      // 1. INSERT staff
      mockConnection.query.mockResolvedValueOnce([{ insertId: 100 }]);
      // 2. syncStaffServices (DELETE)
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 3. syncStaffServices (SELECT IDs)
      mockConnection.query.mockResolvedValueOnce([[{ id: 's1', name: 'Corte' }]]);
      // 4. syncStaffServices (INSERT)
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      // 5. countStaff
      mockQuery.mockResolvedValueOnce([[{ total: 1 }]]);
      // 6. getStaffById (SELECT staff)
      mockQuery.mockResolvedValueOnce([[
        { id: '100', first_name: 'Carlos', last_name: 'Perez', role_name: 'admin', is_active: 1 }
      ]]);
      // 7. getStaffEspecialidades
      mockQuery.mockResolvedValueOnce([[{ service_name: 'Corte' }]]);
      // 8. getStaffSchedule
      mockQuery.mockResolvedValueOnce([[]]);

      const result = await createStaff(userId, {
        nombre: 'Carlos Perez',
        rol: 'admin',
        especialidades: ['Corte']
      });

      expect(result?.id).toBe('100');
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });
});
