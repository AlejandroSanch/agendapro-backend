import request from 'supertest';
import express from 'express';
import { confirmAppointmentPublic } from '../controllers/public.controller';
import { getControlPool } from '../data/db';
import { createSystemNotification } from '../data/repositories/notification.repository';
import { globalErrorHandler } from '../middleware/error.middleware';

jest.mock('../data/db');
jest.mock('../data/repositories/notification.repository');

const app = express();
app.use(express.json());
app.post('/api/public/appointments/:id/confirm', confirmAppointmentPublic);
app.use(globalErrorHandler);

describe('PublicController Integration', () => {
  const mockQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getControlPool as jest.Mock).mockReturnValue({
      query: mockQuery,
    });
  });

  it('debería confirmar cita usando el fast-path (lookup table)', async () => {
    // 1. Resolve tenant via map (resolveTenantForAppointment)
    mockQuery.mockResolvedValueOnce([[{ tenant_db_name: 'tenant_fast' }]]);

    // 2. Update status (confirmAppointmentPublic)
    mockQuery.mockResolvedValueOnce([{}]);

    // 3. Notification info (service name, customer name)
    mockQuery.mockResolvedValueOnce([
      [{ first_name: 'Juan', last_name: 'Perez', service_name: 'Corte' }],
    ]);

    const response = await request(app).post('/api/public/appointments/apt123/confirm');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verificamos que se usó el fast path (primera query a la lookup table)
    expect(mockQuery.mock.calls[0][0]).toContain('FROM appointment_tenant_map');
    expect(createSystemNotification).toHaveBeenCalledWith(
      'tenant_fast',
      expect.objectContaining({
        type: 'appointment_confirmed',
      }),
    );
  });

  it('debería confirmar cita usando el slow-path (scan) y backfill el map', async () => {
    // 1. Fast path falla (resolveTenantForAppointment -> lookup vacía)
    mockQuery.mockResolvedValueOnce([[]]);

    // 2. Obtener tenants para scan
    mockQuery.mockResolvedValueOnce([
      [{ tenant_db_name: 'tenant_a' }, { tenant_db_name: 'tenant_b' }],
    ]);

    // 3. Scan tenant_a (no encontrado)
    mockQuery.mockResolvedValueOnce([[]]);

    // 4. Scan tenant_b (¡encontrado!)
    mockQuery.mockResolvedValueOnce([[{ id: 'apt_legacy' }]]);

    // 5. Backfill lookup table (INSERT IGNORE)
    mockQuery.mockResolvedValueOnce([{}]);

    // 6. Update status (ya en confirmAppointmentPublic)
    mockQuery.mockResolvedValueOnce([{}]);

    // 7. Notification info
    mockQuery.mockResolvedValueOnce([
      [{ first_name: 'Maria', last_name: 'Gomez', service_name: 'Tinte' }],
    ]);

    const response = await request(app).post('/api/public/appointments/apt_legacy/confirm');

    expect(response.status).toBe(200);
    expect(createSystemNotification).toHaveBeenCalledWith('tenant_b', expect.anything());

    // Verificamos que ocurrió el backfill con los parámetros correctos
    const backfillCall = mockQuery.mock.calls.find((call) =>
      call[0].includes('INSERT IGNORE INTO appointment_tenant_map'),
    );
    expect(backfillCall).toBeDefined();
    expect(backfillCall[1]).toEqual(['apt_legacy', 'tenant_b']);
  });

  it('debería retornar 404 si la cita no existe en ningún tenant', async () => {
    // 1. Fast path falla
    mockQuery.mockResolvedValueOnce([[]]);

    // 2. Obtener tenants
    mockQuery.mockResolvedValueOnce([[{ tenant_db_name: 'tenant_a' }]]);

    // 3. Scan tenant_a (no encontrado)
    mockQuery.mockResolvedValueOnce([[]]);

    const response = await request(app).post('/api/public/appointments/apt_nonexistent/confirm');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Cita no encontrada.');
  });
});
