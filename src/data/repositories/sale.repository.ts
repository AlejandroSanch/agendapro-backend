import { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface CheckoutItem {
  type: 'service' | 'product';
  id: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CheckoutPayment {
  method: 'cash' | 'card' | 'transfer' | 'loyalty_points';
  amountCents: number;
}

export interface CheckoutInput {
  customerId: string;
  appointmentId?: string;
  items: CheckoutItem[];
  payments: CheckoutPayment[];
  discountCents?: number;
  notes?: string;
}

export async function createSale(userId: string, input: CheckoutInput): Promise<string | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const subtotalCents = input.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );
    const discountCents = input.discountCents || 0;
    const taxCents = 0; // Por ahora 0, escalable luego
    const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);

    // 1. Crear la Venta
    const [saleResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO ${q(tenantDbName)}.sales (appointment_id, customer_id, subtotal_cents, discount_cents, tax_cents, total_cents, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [input.appointmentId ?? null, input.customerId, subtotalCents, discountCents, taxCents, totalCents, input.notes ?? null],
    );
    const saleId = saleResult.insertId.toString();

    // 2. Insertar Ítems y actualizar inventario
    for (const item of input.items) {
      await connection.query(
        `INSERT INTO ${q(tenantDbName)}.sale_items (sale_id, service_id, product_id, quantity, unit_price_cents)
         VALUES (?, ?, ?, ?, ?)`,
        [
          saleId,
          item.type === 'service' ? item.id : null,
          item.type === 'product' ? item.id : null,
          item.quantity,
          item.unitPriceCents,
        ],
      );

      if (item.type === 'product') {
        // Descontar stock
        await connection.query(
          `UPDATE ${q(tenantDbName)}.products SET stock_quantity = stock_quantity - ? WHERE id = ?`,
          [item.quantity, item.id],
        );

        // Registrar log de inventario
        await connection.query(
          `INSERT INTO ${q(tenantDbName)}.inventory_logs (product_id, type, quantity, notes, created_at)
           VALUES (?, 'out', ?, ?, NOW())`,
          [item.id, item.quantity, `Venta ${saleId}`],
        );
      }
    }

    // 3. Registrar Pagos
    for (const p of input.payments) {
      await connection.query(
        `INSERT INTO ${q(tenantDbName)}.payments (sale_id, amount_cents, method, paid_at)
         VALUES (?, ?, ?, NOW())`,
        [saleId, p.amountCents, p.method],
      );
    }

    // 4. Si hay cita, marcarla como completada
    if (input.appointmentId) {
      await connection.query(
        `UPDATE ${q(tenantDbName)}.appointments SET status = 'completed' WHERE id = ?`,
        [input.appointmentId],
      );
    }

    await connection.commit();
    return saleId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
