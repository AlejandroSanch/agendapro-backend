import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface ProductRecord {
  id: string;
  supplierId: string | null;
  categoryId: string | null;
  sku: string | null;
  name: string;
  unit: string;
  priceCents: number;
  costCents: number;
  stockQuantity: number;
  reorderAlertLevel: number;
  isActive: boolean;
}

export interface CreateProductInput {
  supplierId?: string | null;
  categoryId?: string | null;
  sku?: string | null;
  name: string;
  unit?: string;
  priceCents: number;
  costCents?: number;
  stockQuantity?: number;
  reorderAlertLevel?: number;
  isActive?: boolean;
}

export type UpdateProductInput = Partial<CreateProductInput>;

interface TenantProductRow extends RowDataPacket {
  id: string;
  supplier_id: string | null;
  category_id: string | null;
  sku: string | null;
  name: string;
  unit: string;
  price_cents: number;
  cost_cents: number;
  stock_quantity: number;
  reorder_alert_level: number;
  is_active: number;
}

export async function listProducts(
  userId: string,
  pagination?: { page?: number; limit?: number },
): Promise<{ data: ProductRecord[]; total: number }> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return { data: [], total: 0 };

  const db = getControlPool();

  // 1. Get total count
  const [countRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM ${q(tenantDbName)}.products`,
  );
  const total = Number(countRows[0]?.total ?? 0);

  // 2. Get paginated data
  const limit = Math.min(pagination?.limit || 50, 200);
  const page = Math.max(pagination?.page || 1, 1);
  const offset = (page - 1) * limit;

  const [rows] = await db.query<TenantProductRow[]>(
    `
      SELECT id, supplier_id, category_id, sku, name, unit, price_cents, cost_cents, stock_quantity, reorder_alert_level, is_active
      FROM ${q(tenantDbName)}.products
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `,
    [limit, offset],
  );

  return {
    data: rows.map(toProductRecord),
    total,
  };
}

export async function createProduct(
  userId: string,
  input: CreateProductInput,
): Promise<ProductRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `
      INSERT INTO ${q(tenantDbName)}.products (
        supplier_id, category_id, sku, name, unit, price_cents, cost_cents, stock_quantity, reorder_alert_level, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.supplierId ?? null,
      input.categoryId ?? null,
      input.sku ?? null,
      input.name,
      input.unit ?? 'pieza',
      input.priceCents,
      input.costCents ?? 0,
      input.stockQuantity ?? 0,
      input.reorderAlertLevel ?? 0,
      (input.isActive ?? true) ? 1 : 0,
    ],
  );

  return getProductById(tenantDbName, result.insertId.toString());
}

export async function updateProduct(
  userId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<ProductRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();

  const fields: string[] = [];
  const values: any[] = [];

  if (input.supplierId !== undefined) {
    fields.push('supplier_id = ?');
    values.push(input.supplierId);
  }
  if (input.categoryId !== undefined) {
    fields.push('category_id = ?');
    values.push(input.categoryId);
  }
  if (input.sku !== undefined) {
    fields.push('sku = ?');
    values.push(input.sku);
  }
  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name);
  }
  if (input.unit !== undefined) {
    fields.push('unit = ?');
    values.push(input.unit);
  }
  if (input.priceCents !== undefined) {
    fields.push('price_cents = ?');
    values.push(input.priceCents);
  }
  if (input.costCents !== undefined) {
    fields.push('cost_cents = ?');
    values.push(input.costCents);
  }
  if (input.stockQuantity !== undefined) {
    fields.push('stock_quantity = ?');
    values.push(input.stockQuantity);
  }
  if (input.reorderAlertLevel !== undefined) {
    fields.push('reorder_alert_level = ?');
    values.push(input.reorderAlertLevel);
  }
  if (input.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(input.isActive ? 1 : 0);
  }

  if (fields.length === 0) return getProductById(tenantDbName, productId);

  values.push(productId);
  await db.query(
    `UPDATE ${q(tenantDbName)}.products SET ${fields.join(', ')} WHERE id = ?`,
    values,
  );

  return getProductById(tenantDbName, productId);
}

export async function getProductById(
  tenantDbName: string,
  productId: string,
): Promise<ProductRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<TenantProductRow[]>(
    `SELECT * FROM ${q(tenantDbName)}.products WHERE id = ? LIMIT 1`,
    [productId],
  );

  const row = rows[0];
  if (!row) return null;
  return toProductRecord(row);
}

function toProductRecord(row: TenantProductRow): ProductRecord {
  return {
    id: String(row.id),
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    priceCents: row.price_cents,
    costCents: row.cost_cents,
    stockQuantity: row.stock_quantity,
    reorderAlertLevel: row.reorder_alert_level,
    isActive: row.is_active === 1,
  };
}

export async function createProductsBulk(
  userId: string,
  inputs: CreateProductInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return 0;

  const db = getControlPool();

  const values = inputs.map((input) => [
    input.supplierId ?? null,
    input.categoryId ?? null,
    input.sku ?? null,
    input.name,
    input.unit ?? 'pieza',
    input.priceCents,
    input.costCents ?? 0,
    input.stockQuantity ?? 0,
    input.reorderAlertLevel ?? 0,
    (input.isActive ?? true) ? 1 : 0,
  ]);

  const [result] = await db.query<ResultSetHeader>(
    `
      INSERT INTO ${q(tenantDbName)}.products (
        supplier_id, category_id, sku, name, unit, price_cents, cost_cents, stock_quantity, reorder_alert_level, is_active
      )
      VALUES ?
    `,
    [values],
  );

  return result.affectedRows;
}

export async function deleteProduct(userId: string, productId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.products WHERE id = ?`,
    [productId],
  );

  return result.affectedRows > 0;
}
