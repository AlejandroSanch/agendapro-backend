import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { normalizeServiceCategory, q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface ServiceRecord {
  id: string;
  name: string;
  category: string;
  categoryId: string;
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
  category_id: string;
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
      SELECT s.id, s.name, c.name AS category, s.category_id, s.description, s.duration_minutes, s.price_cents, s.display_order, s.is_active
      FROM ${q(tenantDbName)}.services s
      LEFT JOIN ${q(tenantDbName)}.categories c ON c.id = s.category_id
      WHERE s.deleted_at IS NULL
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

    let finalCatId: string | null = null;
    const targetCategory = (normalized.category || 'General').trim();
    const [catRows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = 'service' LIMIT 1`,
      [targetCategory]
    );
    
    if (!catRows[0]) {
      const [catResult] = await connection.query<ResultSetHeader>(
        `INSERT IGNORE INTO ${q(tenantDbName)}.categories (name, description, type) VALUES (?, '', 'service')`, 
        [targetCategory]
      );
      finalCatId = catResult.insertId ? catResult.insertId.toString() : null;
      
      // Si insertId es 0 (por IGNORE), lo buscamos de nuevo
      if (!finalCatId || finalCatId === '0') {
         const [retryRows] = await connection.query<RowDataPacket[]>(
           `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = 'service' LIMIT 1`,
           [targetCategory]
         );
         finalCatId = retryRows[0]?.id ? String(retryRows[0].id) : null;
      }
    } else {
      finalCatId = String(catRows[0].id);
    }

    try {
      const [result] = await connection.query<ResultSetHeader>(
        `
          INSERT INTO ${q(tenantDbName)}.services (
            name, category_id, description, duration_minutes, price_cents, display_order, is_active, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          normalized.name,
          finalCatId,
          normalized.description,
          normalized.durationMin,
          normalized.priceCents,
          displayOrder,
          normalized.isActive ? 1 : 0,
        ]
      );

      const serviceId = result.insertId.toString();
      await connection.commit();
      return await getServiceById(tenantDbName, serviceId);
    } catch (error) {
      throw error;
    }
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

  // Solo re-resolver categoría si se está cambiando explícitamente
  let finalCatId = current.categoryId;
  if (input.category !== undefined) {
    const targetCategory = (normalized.category || 'General').trim();
    const [catRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = 'service' LIMIT 1`,
      [targetCategory]
    );

    if (!catRows[0]) {
      const [catResult] = await db.query<ResultSetHeader>(
        `INSERT IGNORE INTO ${q(tenantDbName)}.categories (name, description, type) VALUES (?, '', 'service')`, [
        targetCategory,
      ]);
      finalCatId = catResult.insertId ? catResult.insertId.toString() : current.categoryId;
      
      if (!finalCatId || finalCatId === '0') {
        const [retryRows] = await db.query<RowDataPacket[]>(
          `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = 'service' LIMIT 1`,
          [targetCategory]
        );
        finalCatId = retryRows[0]?.id ? String(retryRows[0].id) : current.categoryId;
      }
    } else {
      finalCatId = String(catRows[0].id);
    }
  }

  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE ${q(tenantDbName)}.services
      SET name = ?, category_id = ?, description = ?, duration_minutes = ?, price_cents = ?, display_order = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [
      normalized.name,
      finalCatId,
      normalized.description,
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
  
  // Renombramos el servicio al "borrarlo" para liberar el nombre original
  // y lo marcamos con deleted_at
  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE ${q(tenantDbName)}.services 
      SET 
        deleted_at = NOW(),
        is_active = 0
      WHERE id = ? AND deleted_at IS NULL
    `,
    [serviceId]
  );

  return result.affectedRows > 0;
}

export async function hasActiveAppointments(userId: string, serviceId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) as total 
      FROM ${q(tenantDbName)}.appointment_services aps
      JOIN ${q(tenantDbName)}.appointments a ON a.id = aps.appointment_id
      WHERE aps.service_id = ? 
        AND a.status IN ('scheduled', 'confirmed')
    `,
    [serviceId]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

export async function getServiceById(
  tenantDbName: string,
  serviceId: string
): Promise<ServiceRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<TenantServiceRow[]>(
    `SELECT s.id, s.name, c.name AS category, s.category_id, s.description, s.duration_minutes, s.price_cents, s.display_order, s.is_active FROM ${q(tenantDbName)}.services s LEFT JOIN ${q(tenantDbName)}.categories c ON c.id = s.category_id WHERE s.id = ? LIMIT 1`,
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

export function toServiceRecord(row: TenantServiceRow): ServiceRecord {
  return {
    id: String(row.id),
    name: row.name,
    category: String(row.category || 'general').trim() || 'general',
    categoryId: row.category_id ? String(row.category_id) : '',
    durationMin: Number(row.duration_minutes || 0),
    priceCents: Number(row.price_cents || 0),
    description: row.description ?? '',
    isActive: row.is_active === 1,
    displayOrder: Number(row.display_order || 0),
  };
}
