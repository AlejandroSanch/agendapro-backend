import request from 'supertest';
import { app } from '../index';
import { getControlPool } from '../data/db';
import { createSystemNotification } from '../data/repositories/notification.repository';
import { closeControlPool } from '../data/db';

jest.mock('../data/db');
jest.mock('../data/repositories/notification.repository');

describe('PublicController (Integration)', () => {
  const mockQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getControlPool as jest.Mock).mockReturnValue({
      query: mockQuery,
    });
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('POST /api/public/appointments/:id/confirm', () => {
    it('debería confirmar cita y notificar', async () => {
      // 1. resolveTenantForAppointment (fast path)
      mockQuery.mockResolvedValueOnce([[{ tenant_db_name: 'tenant_fast' }]]);
      // 2. confirmAppointment (UPDATE)
      mockQuery.mockResolvedValueOnce([{}]);
      // 3. confirmAppointment (NOTIFICACION INFO)
      mockQuery.mockResolvedValueOnce([
        [{ first_name: 'Juan', last_name: 'Perez', service_name: 'Corte' }],
      ]);

      const response = await request(app).post('/api/public/appointments/apt123/confirm');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(createSystemNotification).toHaveBeenCalledWith('tenant_fast', expect.anything());
    });
  });

  describe('GET /api/public/appointments/:id/confirm', () => {
    it('debería confirmar vía email y redirigir', async () => {
      mockQuery.mockResolvedValueOnce([[{ tenant_db_name: 'tenant_fast' }]]);
      mockQuery.mockResolvedValueOnce([{}]);
      mockQuery.mockResolvedValueOnce([[]]); // No apt info (fallback a 'Cliente')

      const response = await request(app).get('/api/public/appointments/apt123/confirm');

      expect(response.status).toBe(302);
      expect(response.header.location).toContain('confirmed=true');
    });

    it('debería redirigir con error si la cita no existe', async () => {
      mockQuery.mockResolvedValueOnce([[]]); // Fast path fails
      mockQuery.mockResolvedValueOnce([[]]); // No tenants (scan fails)

      const response = await request(app).get('/api/public/appointments/nonexistent/confirm');

      expect(response.status).toBe(302);
      expect(response.header.location).toContain('error=not_found');
    });
  });

  describe('GET /api/public/appointments/:id/details', () => {
    it('debería obtener detalles públicos', async () => {
      // 1. resolveTenant
      mockQuery.mockResolvedValueOnce([[{ tenant_db_name: 'tenant_fast' }]]);
      // 2. getAppointmentDetails (MAIN QUERY)
      mockQuery.mockResolvedValueOnce([
        [
          {
            id: 'apt123',
            start_at: '2023-10-20 10:00:00',
            service_name: 'Corte',
            customer_name: 'Juan',
            specialist_name: 'Carlos',
            business_address: 'Av. Siempre Viva 123',
          },
        ],
      ]);
      // 3. getAppointmentDetails (BIZ NAME)
      mockQuery.mockResolvedValueOnce([[{ business_name: 'Salon Demo' }]]);

      const response = await request(app).get('/api/public/appointments/apt123');

      expect(response.status).toBe(200);
      expect(response.body.customerName).toBe('Juan');
      expect(response.body.businessName).toBe('Salon Demo');
    });
  });
});
