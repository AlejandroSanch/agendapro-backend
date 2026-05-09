import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
  type: 'service' | 'product';
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
  type: 'service' | 'product';
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export async function listCategories(
  userId: string,
  type?: 'service' | 'product',
): Promise<CategoryRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  let query = `SELECT id, name, description, type FROM ${q(tenantDbName)}.categories`;
  const params: any[] = [];

  if (type) {
    query += ` WHERE type = ?`;
    params.push(type);
  }

  const [rows] = await db.query<RowDataPacket[]>(query, params);

  return rows.map((row) => ({
    ...row,
    id: String(row.id),
  })) as CategoryRecord[];
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput,
): Promise<CategoryRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO ${q(tenantDbName)}.categories (name, description, type) VALUES (?, ?, ?)`,
    [input.name, input.description || null, input.type],
  );

  const categoryId = result.insertId.toString();

  return getCategoryById(tenantDbName, categoryId);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<CategoryRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();

  const updates: string[] = [];
  const params: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    params.push(input.description);
  }

  if (updates.length === 0) return getCategoryById(tenantDbName, categoryId);

  params.push(categoryId);
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE ${q(tenantDbName)}.categories SET ${updates.join(', ')} WHERE id = ?`,
    params,
  );

  if (result.affectedRows === 0) return null;
  return getCategoryById(tenantDbName, categoryId);
}

export async function deleteCategory(userId: string, categoryId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();

  // Check for associated services first
  const [services] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ${q(tenantDbName)}.services WHERE category_id = ? AND deleted_at IS NULL`,
    [categoryId],
  );

  if (Number(services[0]?.total ?? 0) > 0) {
    throw new Error('No se puede eliminar la categoría porque tiene servicios asociados.');
  }

  // Check for associated products
  const [products] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ${q(tenantDbName)}.products WHERE category_id = ?`,
    [categoryId],
  );

  if (Number(products[0]?.total ?? 0) > 0) {
    throw new Error('No se puede eliminar la categoría porque tiene productos asociados.');
  }

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.categories WHERE id = ?`,
    [categoryId],
  );

  return result.affectedRows > 0;
}

export async function getCategoryById(
  tenantDbName: string,
  categoryId: string,
): Promise<CategoryRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, name, description, type FROM ${q(tenantDbName)}.categories WHERE id = ? LIMIT 1`,
    [categoryId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    id: String(row.id),
  } as CategoryRecord;
}
