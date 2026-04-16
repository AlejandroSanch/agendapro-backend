import { randomUUID } from 'crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import {
  isDuplicateKeyError,
  isPrimaryKeyDuplicateError,
  normalizeServiceCategory,
  q,
} from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface ServiceRecord {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  priceCents: number;
  description: string;
  isActive: boolean;
  displayOrder: number;
}

export interface CreateServiceInput {
  name: string;
  category?: string;
  durationMin: number;
  priceCents: number;
  description?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export type UpdateServiceInput = Partial<CreateServiceInput>;

interface TenantServiceRow extends RowDataPacket {
  id: string;
  name: string;
  category: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  display_order: number;
  is_active: number;
}

interface MaxIdRow extends RowDataPacket {
  max_value: number | string | null;
}

export async function listServices(userId: string): Promise<ServiceRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<TenantServiceRow[]>(
    `
      SELECT s.id, s.name, c.name AS category, '' AS description, s.duration_minutes, s.price_cents, s.display_order, s.is_active
      FROM ${q(tenantDbName)}.services s
      LEFT JOIN ${q(tenantDbName)}.categories c ON c.id = s.category_id
      ORDER BY s.display_order ASC, s.name ASC
    `
  );

  return rows.map(toServiceRecord);
}

export async function createService(
  userId: string,
  input: CreateServiceInput
): Promise<ServiceRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const normalized = normalizeCreateServiceInput(input);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const displayOrder =
      normalized.displayOrder === undefined
        ? await getNextServiceDisplayOrder(connection, tenantDbName)
        : normalized.displayOrder;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const serviceId = `svc_${randomUUID()}`;

      const categoryId = 'cat_default';
      const [catRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.categories WHERE name = ? LIMIT 1`, [normalized.category]);
      
      let finalCatId = categoryId;
      if (!catRows[0]) {
        await connection.query(`INSERT IGNORE INTO ${q(tenantDbName)}.categories (id, name, description) VALUES (?, ?, '')`, [categoryId, normalized.category]);
      } else {
        finalCatId = catRows[0].id;
      }

      try {
        await connection.query(
          `
            INSERT INTO ${q(tenantDbName)}.services (
              id, name, category_id, duration_minutes, price_cents, display_order, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            serviceId,
            normalized.name,
            finalCatId,
            normalized.durationMin,
            normalized.priceCents,
            displayOrder,
            normalized.isActive ? 1 : 0,
          ]
        );

        await connection.commit();
        return getServiceById(tenantDbName, serviceId);
      } catch (error) {
        if (isDuplicateKeyError(error) && isPrimaryKeyDuplicateError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('No se pudo generar un id de servicio unico tras varios intentos.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateService(
  userId: string,
  serviceId: string,
  input: UpdateServiceInput
): Promise<ServiceRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const current = await getServiceById(tenantDbName, serviceId);
  if (!current) return null;

  const normalized = normalizeUpdateServiceInput(input, current);
  const db = getControlPool();

  const categoryId = 'cat_default';
  const [catRows] = await db.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.categories WHERE name = ? LIMIT 1`, [normalized.category]);
      
  let finalCatId = categoryId;
  if (!catRows[0]) {
     await db.query(`INSERT IGNORE INTO ${q(tenantDbName)}.categories (id, name, description) VALUES (?, ?, '')`, [categoryId, normalized.category]);
  } else {
     finalCatId = catRows[0].id;
  }

  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE ${q(tenantDbName)}.services
      SET name = ?, category_id = ?, duration_minutes = ?, price_cents = ?, display_order = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [
      normalized.name,
      finalCatId,
      normalized.durationMin,
      normalized.priceCents,
      normalized.displayOrder,
      normalized.isActive ? 1 : 0,
      serviceId,
    ]
  );

  if (!result.affectedRows) return null;
  return getServiceById(tenantDbName, serviceId);
}

export async function deleteService(userId: string, serviceId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.services WHERE id = ?`,
    [serviceId]
  );

  return result.affectedRows > 0;
}

export async function getServiceById(
  tenantDbName: string,
  serviceId: string
): Promise<ServiceRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<TenantServiceRow[]>(
    `SELECT s.id, s.name, c.name AS category, '' AS description, s.duration_minutes, s.price_cents, s.display_order, s.is_active FROM ${q(tenantDbName)}.services s LEFT JOIN ${q(tenantDbName)}.categories c ON c.id = s.category_id WHERE s.id = ? LIMIT 1`,
    [serviceId]
  );

  const row = rows[0];
  if (!row) return null;
  return toServiceRecord(row);
}

async function getNextServiceDisplayOrder(
  connection: PoolConnection,
  tenantDbName: string
): Promise<number> {
  const [rows] = await connection.query<MaxIdRow[]>(
    `SELECT COALESCE(MAX(display_order), 0) AS max_value FROM ${q(tenantDbName)}.services`
  );

  const maxValue = Number(rows[0]?.max_value ?? 0);
  return Number.isFinite(maxValue) ? maxValue + 1 : 1;
}

function normalizeCreateServiceInput(input: CreateServiceInput): CreateServiceInput {
  const displayOrderRaw =
    input.displayOrder === undefined || input.displayOrder === null
      ? undefined
      : Number(input.displayOrder);

  return {
    name: String(input.name || '').trim(),
    category: normalizeServiceCategory(input.category),
    durationMin: Math.max(1, Math.floor(Number(input.durationMin || 0))),
    priceCents: Math.max(0, Math.round(Number(input.priceCents || 0))),
    description: String(input.description || '').trim(),
    isActive: input.isActive ?? true,
    displayOrder:
      displayOrderRaw === undefined || !Number.isFinite(displayOrderRaw)
        ? undefined
        : Math.max(0, Math.floor(displayOrderRaw)),
  };
}

function normalizeUpdateServiceInput(input: UpdateServiceInput, current: ServiceRecord): CreateServiceInput {
  return normalizeCreateServiceInput({
    name: input.name ?? current.name,
    category: input.category ?? current.category,
    durationMin: input.durationMin ?? current.durationMin,
    priceCents: input.priceCents ?? current.priceCents,
    description: input.description ?? current.description,
    isActive: input.isActive ?? current.isActive,
    displayOrder: input.displayOrder ?? current.displayOrder,
  });
}

function toServiceRecord(row: TenantServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    category: String(row.category || 'general').trim() || 'general',
    durationMin: Number(row.duration_minutes || 0),
    priceCents: Number(row.price_cents || 0),
    description: row.description ?? '',
    isActive: row.is_active === 1,
    displayOrder: Number(row.display_order || 0),
  };
}
