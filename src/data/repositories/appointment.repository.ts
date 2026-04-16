import { randomUUID } from 'crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import {
  addMinutesToMySqlDateTime,
  AppointmentStatusDb,
  composeMySqlDateTime,
  isDuplicateKeyError,
  isPrimaryKeyDuplicateError,
  nextSequentialId,
  normalizeAppointmentStatus,
  q,
  splitMySqlDateTime,
} from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

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
        s.name AS service_name, s.duration_minutes AS service_duration_minutes, s.price_cents AS service_price_cents
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
      ${whereClause}
      ORDER BY a.start_at ASC
    `,
    params
  );

  return rows.map(toAppointmentRecord);
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
    
    // Validar solapamiento de cliente
    const overlap = await getCustomerOverlap(connection, tenantDbName, customerId, startAt, endAt);
    if (overlap) {
      throw new Error(`El cliente ya tiene una cita de "${overlap.serviceName}" a las ${overlap.time}.`);
    }

    const serviceId = await ensureService(connection, tenantDbName, normalized.serviceName, normalized.durationMin, normalized.priceCents);

    const appointmentId = `apt_${randomUUID()}`;
    const startAt = composeMySqlDateTime(normalized.date, normalized.time);
    const endAt = addMinutesToMySqlDateTime(startAt, normalized.durationMin);

    const [staffRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.staff LIMIT 1`);
    const defaultStaffId = staffRows[0]?.id || 'stf_placeholder';
    if (!staffRows[0]) {
      await connection.query(`INSERT IGNORE INTO ${q(tenantDbName)}.roles (id, name) VALUES ('rl_admin', 'Admin')`);
      await connection.query(`INSERT IGNORE INTO ${q(tenantDbName)}.staff (id, role_id, first_name, last_name, is_active, created_at, updated_at) VALUES (?, 'rl_admin', 'Sin', 'Asignar', 1, NOW(), NOW())`, [defaultStaffId]);
    }

    await connection.query(
      `
        INSERT INTO ${q(tenantDbName)}.appointments (
          id, customer_id, title, status, start_at, end_at, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        appointmentId, customerId, `${normalized.serviceName} - ${normalized.customerName}`,
        normalized.status, startAt, endAt, normalized.notes || null,
      ]
    );

    await connection.query(
      `INSERT INTO ${q(tenantDbName)}.appointment_services (id, appointment_id, service_id, staff_id) VALUES (?, ?, ?, ?)`,
      [`asv_${randomUUID()}`, appointmentId, serviceId, defaultStaffId]
    );

    await connection.commit();
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
  });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const customerId = await ensureCustomer(connection, tenantDbName, merged.customerName, merged.customerPhone ?? '');
    const serviceId = await ensureService(connection, tenantDbName, merged.serviceName, merged.durationMin, merged.priceCents);

    const startAt = composeMySqlDateTime(merged.date, merged.time);
    const endAt = addMinutesToMySqlDateTime(startAt, merged.durationMin);

    // Validar solapamiento de cliente
    const overlap = await getCustomerOverlap(connection, tenantDbName, customerId, startAt, endAt, appointmentId);
    if (overlap) {
      throw new Error(`El cliente ya tiene una cita de "${overlap.serviceName}" a las ${overlap.time}.`);
    }

    const [result] = await connection.query<ResultSetHeader>(
      `
        UPDATE ${q(tenantDbName)}.appointments
        SET customer_id = ?, title = ?, status = ?, start_at = ?, end_at = ?, notes = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        customerId, `${merged.serviceName} - ${merged.customerName}`, merged.status,
        startAt, endAt, merged.notes || null, appointmentId,
      ]
    );

    // Update pivot
    const [staffRows] = await connection.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.staff LIMIT 1`);
    const defaultStaffId = staffRows[0]?.id || 'stf_placeholder';
    
    await connection.query(`DELETE FROM ${q(tenantDbName)}.appointment_services WHERE appointment_id = ?`, [appointmentId]);
    await connection.query(
      `INSERT INTO ${q(tenantDbName)}.appointment_services (id, appointment_id, service_id, staff_id) VALUES (?, ?, ?, ?)`,
      [`asv_${randomUUID()}`, appointmentId, serviceId, defaultStaffId]
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
        s.name AS service_name, s.duration_minutes AS service_duration_minutes, s.price_cents AS service_price_cents
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
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

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const customerId = await nextSequentialId(connection, `${q(tenantDbName)}.customers`, 'cliente');

    try {
      await connection.query(
        `INSERT INTO ${q(tenantDbName)}.customers (id, first_name, last_name, phone, created_at, updated_at) VALUES (?, ?, '', ?, NOW(), NOW())`,
        [customerId, normalizedName, normalizedPhone || null]
      );
      return customerId;
    } catch (error) {
      if (isDuplicateKeyError(error) && isPrimaryKeyDuplicateError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('No se pudo generar un id de cliente unico tras varios intentos.');
}

async function ensureService(
  connection: PoolConnection,
  tenantDbName: string,
  serviceName: string,
  durationMin: number,
  priceCents: number
): Promise<string> {
  const normalizedName = serviceName.trim();

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

  const serviceId = `svc_${randomUUID()}`;
  await connection.query(
    `INSERT INTO ${q(tenantDbName)}.services (id, name, duration_minutes, price_cents, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
    [serviceId, normalizedName, durationMin, priceCents]
  );
  return serviceId;
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
  };
}

function toAppointmentRecord(row: AppointmentJoinedRow): AppointmentRecord {
  const { date, time } = splitMySqlDateTime(row.start_at);

  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? '',
    serviceName: row.service_name,
    durationMin: Number(row.service_duration_minutes || 0),
    priceCents: Number(row.service_price_cents || 0),
    date,
    time,
    notes: row.notes ?? '',
    status: normalizeAppointmentStatus(row.status),
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
