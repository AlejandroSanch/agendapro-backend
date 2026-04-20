import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface CategoryRecord {
  id: string;
  name: string;
  description: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export async function listCategories(userId: string): Promise<CategoryRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, name, description FROM ${q(tenantDbName)}.categories`
  );

  return rows as CategoryRecord[];
}

export async function createCategory(
  userId: string,
  input: CreateCategoryInput
): Promise<CategoryRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const categoryId = `cat_${randomUUID()}`;

  await db.query(
    `INSERT INTO ${q(tenantDbName)}.categories (id, name, description) VALUES (?, ?, ?)`,
    [categoryId, input.name, input.description || null]
  );

  return getCategoryById(tenantDbName, categoryId);
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput
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
    params
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
    `SELECT COUNT(*) AS total FROM ${q(tenantDbName)}.services WHERE category_id = ?`,
    [categoryId]
  );
  
  if (Number(services[0]?.total ?? 0) > 0) {
    throw new Error('No se puede eliminar la categoría porque tiene servicios asociados.');
  }

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.categories WHERE id = ?`,
    [categoryId]
  );

  return result.affectedRows > 0;
}

export async function getCategoryById(
  tenantDbName: string,
  categoryId: string
): Promise<CategoryRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, name, description FROM ${q(tenantDbName)}.categories WHERE id = ? LIMIT 1`,
    [categoryId]
  );

  const row = rows[0];
  if (!row) return null;
  return row as CategoryRecord;
}
