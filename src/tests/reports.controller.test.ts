import request from 'supertest';
import express from 'express';
import { getStats } from '../controllers/reports.controller';
import { getControlPool } from '../data/db';
import { getTenantDbNameByUserId } from '../data/repositories/user.repository';
import { globalErrorHandler } from '../middleware/error.middleware';

jest.mock('../data/db');
jest.mock('../data/repositories/user.repository');

const app = express();
app.use(express.json());

// Mock middleware para inyectar req.user
app.use((req: any, res, next) => {
  req.user = { id: 'user123' };
  next();
});

app.get('/api/reports/stats', getStats);
app.use(globalErrorHandler);

describe('ReportsController Integration', () => {
  it('debería retornar estadísticas agregadas por SQL correctamente', async () => {
    (getTenantDbNameByUserId as jest.Mock).mockResolvedValue('tenant_demo');

    const mockQuery = jest.fn();
    (getControlPool as jest.Mock).mockReturnValue({
      query: mockQuery,
    });

    // Mockeamos las 6 respuestas que espera el controlador en orden
    mockQuery
      // 1. Resumen
      .mockResolvedValueOnce([[{ totalIngresos: 1500.5, totalCitas: 12, totalCancelaciones: 3 }]])
      // 2. Gráfico diario
      .mockResolvedValueOnce([
        [
          { label: '2023-01-01', ingresos: 1000, citas: 8, cancelaciones: 2 },
          { label: '2023-01-02', ingresos: 500.5, citas: 4, cancelaciones: 1 },
        ],
      ])
      // 3. Clientes (Total y Recurrentes)
      .mockResolvedValueOnce([[{ totalCustomers: 100, recurringCustomers: 25 }]])
      // 4. Inventario Resumen
      .mockResolvedValueOnce([[{ totalValue: 8000, lowStockCount: 5 }]])
      // 4b. Inventario Top
      .mockResolvedValueOnce([
        [
          { nombre: 'Shampoo', stock: 50, valor: 1000 },
          { nombre: 'Acondicionador', stock: 30, valor: 600 },
        ],
      ])
      // 5. Staff Ranking
      .mockResolvedValueOnce([
        [
          { nombre: 'Ana Lopez', citas: 10, ingresos: 1200 },
          { nombre: 'Carlos Ruiz', citas: 2, ingresos: 300.5 },
        ],
      ]);

    const response = await request(app).get('/api/reports/stats');

    expect(response.status).toBe(200);

    // Verificaciones del summary
    expect(response.body.summary).toEqual({
      totalIngresos: 1500.5,
      totalCitas: 12,
      totalCustomers: 100,
      recurringPct: 25, // 25 de 100 = 25%
      inventoryValue: 8000,
      lowStockItems: 5,
    });

    // Verificaciones de los rankings
    expect(response.body.rankings.staff).toHaveLength(2);
    expect(response.body.rankings.staff[0].nombre).toBe('Ana Lopez');
    expect(response.body.rankings.staff[0].avatar).toBe('AN');

    expect(response.body.rankings.inventory).toHaveLength(2);
    expect(response.body.rankings.inventory[0].nombre).toBe('Shampoo');

    expect(mockQuery).toHaveBeenCalledTimes(6);
  });

  it('debería retornar 404 si el tenant no existe', async () => {
    (getTenantDbNameByUserId as jest.Mock).mockResolvedValue(null);

    const response = await request(app).get('/api/reports/stats');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Tenant no encontrado.');
  });
});
