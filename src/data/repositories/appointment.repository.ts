import { randomUUID } from 'crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import {
  addMinutesToMySqlDateTime,
  AppointmentStatusDb,
  composeMySqlDateTime,
  normalizeAppointmentStatus,
  q,
  splitMySqlDateTime,
} from '../utils';
import { getTenantDbNameByUserId } from './user.repository';
import { logger } from '../../utils/logger';

export interface AppointmentRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  date: string;
  time: string;
  notes: string;
  status: AppointmentStatusDb;
  trabajador: string;
}

export interface UpsertAppointmentInput {
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  date: string;
  time: string;
  notes?: string;
  status: AppointmentStatusDb;
  trabajador?: string;
}

export type UpdateAppointmentInput = Partial<UpsertAppointmentInput>;

interface AppointmentJoinedRow extends RowDataPacket {
  id: string;
  status: AppointmentStatusDb;
  start_at: string;
  notes: string | null;
  customer_name: string;
  customer_phone: string | null;
  service_name: string;
  service_duration_minutes: number;
  service_price_cents: number;
  staff_name: string | null;
}

interface IdRow extends RowDataPacket {
  id: string;
}

export async function listAppointments(
  userId: string,
  filters?: { dateFrom?: string; dateTo?: string }
): Promise<AppointmentRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const whereParts: string[] = [];
  const params: unknown[] = [];

  if (filters?.dateFrom) {
    whereParts.push('DATE(a.start_at) >= ?');
    params.push(filters.dateFrom);
  }

  if (filters?.dateTo) {
    whereParts.push('DATE(a.start_at) <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [rows] = await db.query<AppointmentJoinedRow[]>(
    `
      SELECT
        a.id, a.status, DATE_FORMAT(a.start_at, '%Y-%m-%d %H:%i:%s') AS start_at, a.notes,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name, c.phone AS customer_phone,
        COALESCE(s.name, a.service_name) AS service_name, s.duration_minutes AS service_duration_minutes, s.price_cents AS service_price_cents,
        CONCAT(st.first_name, ' ', st.last_name) AS staff_name
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
      LEFT JOIN ${q(tenantDbName)}.staff st ON st.id = aserv.staff_id
      ${whereClause}
      ORDER BY a.start_at ASC
    `,
    params
  );

  return rows.map(toAppointmentRecord);
}

export async function findAppointmentById(
  userId: string,
  appointmentId: string
): Promise<AppointmentRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;
  return getAppointmentById(tenantDbName, appointmentId);
}

export async function createAppointment(
  userId: string,
  input: UpsertAppointmentInput
): Promise<AppointmentRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const normalized = normalizeUpsertAppointmentInput(input);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const customerId = await ensureCustomer(connection, tenantDbName, normalized.customerName, normalized.customerPhone ?? '');
    
    const startAt = composeMySqlDateTime(normalized.date, normalized.time);
    const endAt = addMinutesToMySqlDateTime(startAt, normalized.durationMin);

    // Validar: No permitir completar citas en el futuro
    if (normalized.status === 'completed') {
      const startAtDate = new Date(startAt.replace(' ', 'T'));
      if (startAtDate > new Date()) {
        throw new Error('No se puede completar una cita con fecha futura.');
      }
    }

    // Validar solapamiento de cliente
    const overlap = await getCustomerOverlap(connection, tenantDbName, customerId, startAt, endAt);
    if (overlap) {
      throw new Error(`El cliente ya tiene una cita de "${overlap.serviceName}" a las ${overlap.time}.`);
    }

    const serviceId = await ensureService(connection, tenantDbName, normalized.serviceName, normalized.durationMin, normalized.priceCents);

    let staffId: string | null = null;
    if (normalized.trabajador) {
      const normalizedStaffName = normalized.trabajador.trim().toLowerCase().replace(/\s+/g, ' ');
      const [staffRows] = await connection.query<IdRow[]>(
        `SELECT id FROM ${q(tenantDbName)}.staff WHERE LOWER(CONCAT(first_name, ' ', last_name)) = ? LIMIT 1`,
        [normalizedStaffName]
      );
      if (staffRows[0]?.id) {
        staffId = String(staffRows[0].id);
      }
    }
    
    // Si no se encontró o no se envió trabajador, usamos el primer staff
    if (!staffId) {
      const [staffRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.staff WHERE deleted_at IS NULL LIMIT 1`);
      if (staffRows[0]?.id) {
        staffId = String(staffRows[0].id);
      } else {
        // Crear un empleado por defecto (role_id 1 = admin)
        const [insertResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO ${q(tenantDbName)}.staff (role_id, first_name, last_name, is_active, created_at, updated_at) VALUES (1, 'Sin', 'Asignar', 1, NOW(), NOW())`
        );
        staffId = insertResult.insertId.toString();
      }
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO ${q(tenantDbName)}.appointments (
          customer_id, service_name, status, start_at, end_at, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        customerId, normalized.serviceName,
        normalized.status, startAt, endAt, normalized.notes || null,
      ]
    );
    
    const appointmentId = result.insertId.toString();

    await connection.query(
      `INSERT INTO ${q(tenantDbName)}.appointment_services (appointment_id, service_id, staff_id) VALUES (?, ?, ?)`,
      [appointmentId, serviceId, staffId]
    );

    await connection.commit();

    // Register in control DB lookup table for O(1) public access
    try {
      await db.query(
        `INSERT IGNORE INTO appointment_tenant_map (appointment_id, tenant_db_name) VALUES (?, ?)`,
        [appointmentId, tenantDbName]
      );
    } catch (err) { 
      logger.warn({ err, appointmentId, tenantDbName }, 'Failed to register appointment in lookup table');
    }

    return getAppointmentById(tenantDbName, appointmentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAppointment(
  userId: string,
  appointmentId: string,
  input: UpdateAppointmentInput
): Promise<AppointmentRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const current = await getAppointmentById(tenantDbName, appointmentId);
  if (!current) return null;

  const merged = normalizeUpsertAppointmentInput({
    customerName: input.customerName ?? current.customerName,
    customerPhone: input.customerPhone ?? current.customerPhone,
    serviceName: input.serviceName ?? current.serviceName,
    durationMin: input.durationMin ?? current.durationMin,
    priceCents: input.priceCents ?? current.priceCents,
    date: input.date ?? current.date,
    time: input.time ?? current.time,
    notes: input.notes ?? current.notes,
    status: input.status ?? current.status,
    trabajador: input.trabajador ?? current.trabajador,
  });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const customerId = await ensureCustomer(connection, tenantDbName, merged.customerName, merged.customerPhone ?? '');
    const serviceId = await ensureService(connection, tenantDbName, merged.serviceName, merged.durationMin, merged.priceCents);

    const startAt = composeMySqlDateTime(merged.date, merged.time);
    const endAt = addMinutesToMySqlDateTime(startAt, merged.durationMin);

    // Validar: No permitir completar citas en el futuro
    if (merged.status === 'completed') {
      const startAtDate = new Date(startAt.replace(' ', 'T'));
      if (startAtDate > new Date()) {
        throw new Error('No se puede completar una cita con fecha futura.');
      }
    }

    // Validar solapamiento de cliente
    const overlap = await getCustomerOverlap(connection, tenantDbName, customerId, startAt, endAt, appointmentId);
    if (overlap) {
      throw new Error(`El cliente ya tiene una cita de "${overlap.serviceName}" a las ${overlap.time}.`);
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
        UPDATE ${q(tenantDbName)}.appointments
        SET customer_id = ?, service_name = ?, status = ?, start_at = ?, end_at = ?, notes = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        customerId, merged.serviceName, merged.status,
        startAt, endAt, merged.notes || null, appointmentId,
      ]
    );

    // Update pivot
    let staffId: string | null = null;
    if (merged.trabajador) {
      const normalizedStaffName = merged.trabajador.trim().toLowerCase().replace(/\s+/g, ' ');
      const [staffRows] = await connection.query<IdRow[]>(
        `SELECT id FROM ${q(tenantDbName)}.staff WHERE LOWER(CONCAT(first_name, ' ', last_name)) = ? LIMIT 1`,
        [normalizedStaffName]
      );
      if (staffRows[0]?.id) {
        staffId = String(staffRows[0].id);
      }
    }
    
    // Si no se encontró, mantenemos el actual o asignamos el primero
    if (!staffId) {
      const [currentStaffRows] = await connection.query<IdRow[]>(`SELECT staff_id as id FROM ${q(tenantDbName)}.appointment_services WHERE appointment_id = ? LIMIT 1`, [appointmentId]);
      if (currentStaffRows[0]?.id) {
         staffId = String(currentStaffRows[0].id);
      } else {
         const [staffRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.staff WHERE deleted_at IS NULL LIMIT 1`);
         staffId = staffRows[0]?.id ? String(staffRows[0].id) : '1';
      }
    }
    
    await connection.query(`DELETE FROM ${q(tenantDbName)}.appointment_services WHERE appointment_id = ?`, [appointmentId]);
    await connection.query(
      `INSERT INTO ${q(tenantDbName)}.appointment_services (appointment_id, service_id, staff_id) VALUES (?, ?, ?)`,
      [appointmentId, serviceId, staffId]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return null;
    }

    await connection.commit();
    return getAppointmentById(tenantDbName, appointmentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getAppointmentById(
  tenantDbName: string,
  appointmentId: string
): Promise<AppointmentRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<AppointmentJoinedRow[]>(
    `
      SELECT
        a.id, a.status, DATE_FORMAT(a.start_at, '%Y-%m-%d %H:%i:%s') AS start_at, a.notes,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name, c.phone AS customer_phone,
        COALESCE(s.name, a.service_name) AS service_name, s.duration_minutes AS service_duration_minutes, s.price_cents AS service_price_cents,
        CONCAT(st.first_name, ' ', st.last_name) AS staff_name
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
      LEFT JOIN ${q(tenantDbName)}.staff st ON st.id = aserv.staff_id
      WHERE a.id = ? LIMIT 1
    `,
    [appointmentId]
  );

  const row = rows[0];
  if (!row) return null;
  return toAppointmentRecord(row);
}

async function ensureCustomer(
  connection: PoolConnection,
  tenantDbName: string,
  customerName: string,
  customerPhone: string
): Promise<string> {
  const normalizedName = customerName.trim();
  const normalizedPhone = customerPhone.trim();

  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM ${q(tenantDbName)}.customers WHERE CONCAT(first_name, ' ', last_name) = ? AND ((phone IS NULL AND ? = '') OR phone = ?) LIMIT 1`,
    [normalizedName, normalizedPhone, normalizedPhone]
  );

  if (rows[0]?.id) return rows[0].id;

  try {
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO ${q(tenantDbName)}.customers (first_name, last_name, phone, created_at, updated_at) VALUES (?, '', ?, NOW(), NOW())`,
      [normalizedName, normalizedPhone || null]
    );
    return result.insertId.toString();
  } catch (error) {
    throw error;
  }
}

async function ensureService(
  connection: PoolConnection,
  tenantDbName: string,
  serviceName: string,
  durationMin: number,
  priceCents: number
): Promise<string> {
  const normalizedName = serviceName.trim();

  // 1. Intentar encontrar servicio existente por nombre
  const [rows] = await connection.query<IdRow[]>(
    `SELECT id FROM ${q(tenantDbName)}.services WHERE name = ? LIMIT 1`,
    [normalizedName]
  );

  if (rows[0]?.id) {
    await connection.query(
      `UPDATE ${q(tenantDbName)}.services SET duration_minutes = ?, price_cents = ?, is_active = 1, updated_at = NOW() WHERE id = ?`,
      [durationMin, priceCents, rows[0].id]
    );
    return rows[0].id;
  }

  // 2. No existe, vamos a crearlo. Primero necesitamos una categoría (por defecto 'General')
  const defaultCategory = 'General';
  let categoryId: string;

  const [catRows] = await connection.query<IdRow[]>(
    `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [defaultCategory]
  );

  if (catRows[0]?.id) {
    categoryId = String(catRows[0].id);
  } else {
    // Si no existe la categoría General, la creamos
    const [catResult] = await connection.query<ResultSetHeader>(
      `INSERT IGNORE INTO ${q(tenantDbName)}.categories (name, description) VALUES (?, 'Categoría por defecto para servicios auto-generados')`,
      [defaultCategory]
    );
    
    // Si el INSERT IGNORE no insertó nada (porque se creó justo antes), volvemos a buscar el ID
    if (!catResult.insertId) {
      const [catRowsRetry] = await connection.query<IdRow[]>(
        `SELECT id FROM ${q(tenantDbName)}.categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        [defaultCategory]
      );
      categoryId = String(catRowsRetry[0]?.id || '1');
    } else {
      categoryId = catResult.insertId.toString();
    }
  }

  // 3. Crear el servicio con el category_id resuelto
  const [serviceResult] = await connection.query<ResultSetHeader>(
    `INSERT INTO ${q(tenantDbName)}.services (category_id, name, duration_minutes, price_cents, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
    [categoryId, normalizedName, durationMin, priceCents]
  );
  return serviceResult.insertId.toString();
}

function normalizeUpsertAppointmentInput(input: UpsertAppointmentInput): UpsertAppointmentInput {
  return {
    customerName: String(input.customerName || '').trim(),
    customerPhone: String(input.customerPhone || '').trim(),
    serviceName: String(input.serviceName || '').trim(),
    durationMin: Math.max(1, Math.floor(Number(input.durationMin || 0))),
    priceCents: Math.max(0, Math.round(Number(input.priceCents || 0))),
    date: String(input.date || '').trim(),
    time: String(input.time || '').trim(),
    notes: String(input.notes || '').trim(),
    status: normalizeAppointmentStatus(input.status),
    trabajador: String(input.trabajador || '').trim(),
  };
}

function toAppointmentRecord(row: AppointmentJoinedRow): AppointmentRecord {
  const { date, time } = splitMySqlDateTime(row.start_at);

  return {
    id: String(row.id),
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? '',
    serviceName: row.service_name,
    durationMin: Number(row.service_duration_minutes || 0),
    priceCents: Number(row.service_price_cents || 0),
    date,
    time,
    notes: row.notes ?? '',
    status: normalizeAppointmentStatus(row.status),
    trabajador: row.staff_name ?? '',
  };
}

async function getCustomerOverlap(
  connection: PoolConnection,
  tenantDbName: string,
  customerId: string,
  startAt: string,
  endAt: string,
  excludeAppointmentId?: string
): Promise<{ serviceName: string; time: string } | null> {
  const whereParts = [
    'a.customer_id = ?',
    'a.start_at < ?',
    'a.end_at > ?',
    "a.status NOT IN ('cancelled', 'no_show')"
  ];
  const params = [customerId, endAt, startAt];

  if (excludeAppointmentId) {
    whereParts.push('a.id != ?');
    params.push(excludeAppointmentId);
  }

  const [rows] = await connection.query<AppointmentJoinedRow[]>(
    `
      SELECT s.name as service_name, DATE_FORMAT(a.start_at, '%H:%i') as start_time
      FROM ${q(tenantDbName)}.appointments a
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
      WHERE ${whereParts.join(' AND ')}
      LIMIT 1
    `,
    params
  );

  const row = rows[0];
  if (!row) return null;

  return {
    serviceName: row.service_name || 'Servicio desconocido',
    time: row.start_time,
  };
}
