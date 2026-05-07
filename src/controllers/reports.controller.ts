import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { listAppointments } from '../data/repositories/appointment.repository';
import { listCustomers } from '../data/repositories/customer.repository';
import { listProducts } from '../data/repositories/product.repository';
import { listStaff } from '../data/repositories/staff.repository';

export const getStats = asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const userId = req.user.id;

    // 1. Obtener datos base
    const appointments = await listAppointments(userId);
    const customers = await listCustomers(userId);
    const products = await listProducts(userId);
    const staff = await listStaff(userId);

    // 2. Procesar Citas (Ventas e Ingresos)
    // Agrupamos por fecha para los gráficos
    const statsByDate: Record<string, { ingresos: number, citas: number, cancelaciones: number }> = {};
    
    appointments.forEach(apt => {
      const date = apt.date; // format YYYY-MM-DD
      if (!statsByDate[date]) {
        statsByDate[date] = { ingresos: 0, citas: 0, cancelaciones: 0 };
      }
      
      if (apt.status === 'cancelled' || apt.status === 'no_show') {
        statsByDate[date].cancelaciones++;
      } else {
        statsByDate[date].citas++;
        statsByDate[date].ingresos += (apt.priceCents || 0) / 100;
      }
    });

    // 3. Procesar Clientes
    const totalCustomers = customers.length;
    const recurringCustomers = customers.filter(c => {
        const apts = appointments.filter(a => a.customerName === c.nombre);
        return apts.length > 1;
    }).length;

    // 4. Procesar Inventario
    const inventoryStats = {
      totalValue: products.reduce((acc: number, p: any) => acc + ((p.priceCents || 0) / 100 * (p.stockQuantity || 0)), 0),
      lowStockCount: products.filter(p => (p.stockQuantity || 0) < 10).length,
      topProducts: products
        .sort((a, b) => (b.stockQuantity || 0) - (a.stockQuantity || 0))
        .slice(0, 5)
        .map(p => ({ nombre: p.name, stock: p.stockQuantity || 0, valor: (p.priceCents || 0) / 100 * (p.stockQuantity || 0) }))
    };

    // 5. Ranking de Staff
    const staffRanking = staff.map(s => {
      const staffApts = appointments.filter(a => a.trabajador === s.nombre);
      const sales = staffApts.reduce((acc: number, a: any) => acc + (a.status !== 'cancelled' ? (a.priceCents || 0) / 100 : 0), 0);
      return {
        nombre: s.nombre,
        citas: staffApts.length,
        ingresos: sales,
        avatar: s.nombre.substring(0, 2).toUpperCase()
      };
    }).sort((a: any, b: any) => b.ingresos - a.ingresos);

    res.json({
      summary: {
        totalIngresos: appointments.reduce((acc: number, a: any) => acc + (a.status !== 'cancelled' ? (a.priceCents || 0) / 100 : 0), 0),
        totalCitas: appointments.length,
        totalCustomers,
        recurringPct: totalCustomers > 0 ? Math.round((recurringCustomers / totalCustomers) * 100) : 0,
        inventoryValue: inventoryStats.totalValue,
        lowStockItems: inventoryStats.lowStockCount
      },
      charts: {
        daily: Object.entries(statsByDate).map(([label, data]) => ({ label, ...data })),
      },
      rankings: {
        staff: staffRanking,
        inventory: inventoryStats.topProducts
      }
    });
});
