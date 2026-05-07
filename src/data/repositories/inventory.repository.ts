import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface InventoryLogRecord {
  id: string;
  productId: string;
  productName?: string;
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'service';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  notes: string | null;
  staffId: string | null;
  createdAt: string;
}

export interface CreateInventoryLogInput {
  productId: string;
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'service';
  quantity: number;
  notes?: string | null;
  staffId?: string | null;
}

export async function listInventoryLogs(userId: string): Promise<InventoryLogRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT l.*, p.name as product_name
      FROM ${q(tenantDbName)}.inventory_logs l
      JOIN ${q(tenantDbName)}.products p ON l.product_id = p.id
      ORDER BY l.created_at DESC
      LIMIT 500
    `
  );

  return rows.map(row => ({
    id: String(row.id),
    productId: String(row.product_id),
    productName: row.product_name,
    type: row.type,
    quantity: row.quantity,
    stockBefore: row.stock_before,
    stockAfter: row.stock_after,
    notes: row.notes,
    staffId: row.staff_id ? String(row.staff_id) : null,
    createdAt: row.created_at,
  }));
}

export async function adjustStock(
  userId: string,
  input: CreateInventoryLogInput
): Promise<InventoryLogRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  
  // 1. Obtener stock actual
  const [products] = await db.query<RowDataPacket[]>(
    `SELECT stock_quantity FROM ${q(tenantDbName)}.products WHERE id = ?`,
    [input.productId]
  );
  if (products.length === 0) return null;
  
  const stockBefore = products[0].stock_quantity;
  let stockAfter = stockBefore;

  if (input.type === 'in') {
    stockAfter += input.quantity;
  } else if (input.type === 'adjustment') {
    stockAfter = input.quantity; // En ajuste, la cantidad es el nuevo stock total
  } else {
    stockAfter -= input.quantity;
  }

  // 2. Actualizar stock en tabla productos
  await db.query(
    `UPDATE ${q(tenantDbName)}.products SET stock_quantity = ? WHERE id = ?`,
    [stockAfter, input.productId]
  );

  // 3. Crear log
  const quantityForLog = input.type === 'adjustment' ? input.quantity - stockBefore : input.quantity;

  const [result] = await db.query<ResultSetHeader>(
    `
      INSERT INTO ${q(tenantDbName)}.inventory_logs (
        product_id, type, quantity, stock_before, stock_after, notes, staff_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.productId,
      input.type,
      quantityForLog,
      stockBefore,
      stockAfter,
      input.notes ?? null,
      input.staffId ?? null,
    ]
  );

  return {
    id: result.insertId.toString(),
    productId: input.productId,
    type: input.type,
    quantity: quantityForLog,
    stockBefore,
    stockAfter,
    notes: input.notes ?? null,
    staffId: input.staffId ?? null,
    createdAt: new Date().toISOString(),
  };
}
