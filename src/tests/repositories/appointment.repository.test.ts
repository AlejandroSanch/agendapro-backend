import {
  listAppointments,
  findAppointmentById,
  createAppointment,
  updateAppointment,
} from '../../data/repositories/appointment.repository';
import { getControlPool } from '../../data/db';
import { getTenantDbNameByUserId } from '../../data/repositories/user.repository';

jest.mock('../../data/db');
jest.mock('../../data/repositories/user.repository');

describe('AppointmentRepository', () => {
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

  describe('listAppointments', () => {
    it('debería listar citas y el total', async () => {
      mockQuery.mockResolvedValueOnce([[{ total: 5 }]]); // Count
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 'a1',
            status: 'scheduled',
            start_at: '2023-10-20 10:00:00',
            customer_name: 'Juan Perez',
            service_name: 'Corte',
          },
        ],
      ]); // Data

      const result = await listAppointments(userId, { limit: 10 });

      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe('a1');
    });
  });

  describe('createAppointment', () => {
    const input = {
      customerName: 'Juan Perez',
      serviceName: 'Corte',
      durationMin: 30,
      priceCents: 1500,
      date: '2023-10-20',
      time: '10:00',
      status: 'scheduled' as any,
    };

    it('debería crear una cita exitosamente', async () => {
      // Mock dinámico para manejar las múltiples consultas en orden
      mockConnection.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM') && sql.includes('.customers')) return [[{ id: 'c1' }]];
        if (sql.includes('SELECT') && sql.includes('FROM') && sql.includes('.appointments'))
          return [[]]; // overlap
        if (sql.includes('FROM') && sql.includes('.services')) return [[{ id: 's1' }]];
        if (sql.includes('FROM') && sql.includes('.staff')) return [[{ id: 'st1' }]];
        if (sql.includes('INSERT INTO') && sql.includes('.appointments'))
          return [{ insertId: 'new_a1' }];
        if (sql.includes('INSERT INTO') && sql.includes('.appointment_services'))
          return [{ affectedRows: 1 }];
        return [[]];
      });

      mockQuery.mockResolvedValue([
        [
          {
            id: 'new_a1',
            status: 'scheduled',
            start_at: '2023-10-20 10:00:00',
            customer_name: 'Juan Perez',
            service_name: 'Corte',
          },
        ],
      ]);

      const result = await createAppointment(userId, input);

      expect(result?.id).toBe('new_a1');
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    it('debería fallar si se intenta completar una cita futura', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0]!;

      // Mock de los pasos previos necesarios antes de llegar al check de fecha
      mockConnection.query.mockResolvedValueOnce([[{ id: 'c1' }]]); // ensureCustomer

      await expect(
        createAppointment(userId, { ...input, date: dateStr, status: 'completed' as any }),
      ).rejects.toThrow('No se puede completar una cita con fecha futura.');
    });
  });
});
