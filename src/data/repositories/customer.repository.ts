import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import {
  isDuplicateKeyError,
  isPrimaryKeyDuplicateError,
  nextSequentialId,
  q,
} from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

// ── Types ────────────────────────────────────────────────────────────────────

export type CustomerSex = 'masculino' | 'femenino' | 'otro' | '';

export interface CustomerRecord {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  fechaNacimiento: string;
  sexo: CustomerSex;
  notas: string;
  activo: boolean;
  fechaRegistro: string;
  /** Citas resumidas del cliente */
  citas: CustomerCitaRecord[];
}

export interface CustomerCitaRecord {
  id: string;
  fecha: string;
  hora: string;
  servicio: string;
  precio: number;
  estado: 'completada' | 'cancelada' | 'pendiente' | 'confirmada';
}

export interface UpsertCustomerInput {
  nombre: string;
  telefono?: string;
  email?: string;
  fechaNacimiento?: string;
  sexo?: CustomerSex;
  notas?: string;
}

export type UpdateCustomerInput = Partial<UpsertCustomerInput>;

// ── Internal row types ────────────────────────────────────────────────────────

interface CustomerRow extends RowDataPacket {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  sex: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
}

interface AppointmentRow extends RowDataPacket {
  id: string;
  start_at: string;
  status: string;
  service_name: string | null;
  service_price_cents: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

const STATUS_MAP: Record<string, CustomerCitaRecord['estado']> = {
  scheduled: 'pendiente',
  confirmed: 'confirmada',
  completed: 'completada',
  cancelled: 'cancelada',
  no_show: 'cancelada',
};

function toCustomerRecord(row: CustomerRow, citas: CustomerCitaRecord[]): CustomerRecord {
  const nombre = [row.first_name, row.last_name].filter(Boolean).join(' ');
  const sexo = (['masculino', 'femenino', 'otro'].includes(row.sex ?? '')
    ? (row.sex as CustomerSex)
    : '') as CustomerSex;

  return {
    id: row.id,
    nombre,
    telefono: row.phone ?? '',
    email: row.email ?? '',
    fechaNacimiento: row.birth_date ?? '',
    sexo,
    notas: row.notes ?? '',
    activo: row.is_active === 1,
    fechaRegistro: row.created_at.slice(0, 10),
    citas,
  };
}

function toCustomerCitaRecord(row: AppointmentRow): CustomerCitaRecord {
  const startAt = String(row.start_at ?? '');
  const fecha = startAt.slice(0, 10);
  const hora = startAt.slice(11, 16);
  const estado = STATUS_MAP[row.status] ?? 'pendiente';
  return {
    id: row.id,
    fecha,
    hora,
    servicio: row.service_name ?? '',
    precio: Math.round(Number(row.service_price_cents ?? 0)) / 100,
    estado,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────────

async function fetchCitasForCustomer(
  tenantDbName: string,
  customerId: string
): Promise<CustomerCitaRecord[]> {
  const db = getControlPool();
  const [rows] = await db.query<AppointmentRow[]>(
    `
      SELECT
        a.id,
        DATE_FORMAT(a.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
        a.status,
        s.name AS service_name,
        s.price_cents AS service_price_cents
      FROM ${q(tenantDbName)}.appointments a
      LEFT JOIN ${q(tenantDbName)}.appointment_services aserv ON aserv.appointment_id = a.id
      LEFT JOIN ${q(tenantDbName)}.services s ON s.id = aserv.service_id
      WHERE a.customer_id = ?
      ORDER BY a.start_at DESC
    `,
    [customerId]
  );
  return rows.map(toCustomerCitaRecord);
}

// ── Schema guard ──────────────────────────────────────────────────────────────

/**
 * Agrega la columna `sex` a customers si no existe todavía.
 * Esto garantiza compatibilidad aunque la migración Umzug aún no haya corrido.
 */
async function ensureCustomersSchema(tenantDbName: string): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME   = 'customers'
       AND COLUMN_NAME  = 'sex'`,
    [tenantDbName]
  );

  if ((rows as RowDataPacket[]).length === 0) {
    await db.query(
      `ALTER TABLE ${q(tenantDbName)}.customers
         ADD COLUMN sex ENUM('masculino','femenino','otro') NULL DEFAULT NULL
           AFTER birth_date`
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listCustomers(userId: string): Promise<CustomerRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  await ensureCustomersSchema(tenantDbName);

  const db = getControlPool();
  const [rows] = await db.query<CustomerRow[]>(
    `
      SELECT id, first_name, last_name, phone, email, birth_date, sex, notes, is_active,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM ${q(tenantDbName)}.customers
      ORDER BY first_name ASC, last_name ASC
    `
  );

  const records: CustomerRecord[] = [];
  for (const row of rows) {
    const citas = await fetchCitasForCustomer(tenantDbName, row.id);
    records.push(toCustomerRecord(row, citas));
  }
  return records;
}

export async function getCustomerById(
  userId: string,
  customerId: string
): Promise<CustomerRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [rows] = await db.query<CustomerRow[]>(
    `
      SELECT id, first_name, last_name, phone, email, birth_date, sex, notes, is_active,
             DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM ${q(tenantDbName)}.customers
      WHERE id = ? LIMIT 1
    `,
    [customerId]
  );

  const row = rows[0];
  if (!row) return null;
  const citas = await fetchCitasForCustomer(tenantDbName, row.id);
  return toCustomerRecord(row, citas);
}

export async function createCustomer(
  userId: string,
  input: UpsertCustomerInput
): Promise<CustomerRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  await ensureCustomersSchema(tenantDbName);

  const db = getControlPool();
  const { firstName, lastName } = splitName(input.nombre ?? '');
  const phone = (input.telefono ?? '').trim() || null;
  const email = (input.email ?? '').trim() || null;
  const birthDate = (input.fechaNacimiento ?? '').trim() || null;
  const sex = (input.sexo ?? '').trim() || null;
  const notes = (input.notas ?? '').trim() || null;

  const connection = await db.getConnection();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const customerId = await nextSequentialId(connection, `${q(tenantDbName)}.customers`, 'cliente');
      try {
        await connection.query(
          `
            INSERT INTO ${q(tenantDbName)}.customers
              (id, first_name, last_name, phone, email, birth_date, sex, notes, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
          `,
          [customerId, firstName, lastName, phone, email, birthDate, sex, notes]
        );
        return getCustomerById(userId, customerId);
      } catch (error) {
        if (isDuplicateKeyError(error) && isPrimaryKeyDuplicateError(error)) continue;
        throw error;
      }
    }
    throw new Error('No se pudo generar un ID de cliente único.');
  } finally {
    connection.release();
  }
}

export async function updateCustomer(
  userId: string,
  customerId: string,
  input: UpdateCustomerInput
): Promise<CustomerRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const setParts: string[] = [];
  const params: unknown[] = [];

  if (input.nombre !== undefined) {
    const { firstName, lastName } = splitName(input.nombre);
    setParts.push('first_name = ?', 'last_name = ?');
    params.push(firstName, lastName);
  }
  if (input.telefono !== undefined) { setParts.push('phone = ?'); params.push(input.telefono.trim() || null); }
  if (input.email !== undefined) { setParts.push('email = ?'); params.push(input.email.trim() || null); }
  if (input.fechaNacimiento !== undefined) { setParts.push('birth_date = ?'); params.push(input.fechaNacimiento.trim() || null); }
  if (input.sexo !== undefined) { setParts.push('sex = ?'); params.push(input.sexo || null); }
  if (input.notas !== undefined) { setParts.push('notes = ?'); params.push(input.notas.trim() || null); }

  if (setParts.length === 0) return getCustomerById(userId, customerId);

  setParts.push('updated_at = NOW()');
  params.push(customerId);

  const [result] = await db.query<ResultSetHeader>(
    `UPDATE ${q(tenantDbName)}.customers SET ${setParts.join(', ')} WHERE id = ?`,
    params
  );

  if (!result.affectedRows) return null;
  return getCustomerById(userId, customerId);
}

export async function toggleCustomerActive(
  userId: string,
  customerId: string
): Promise<CustomerRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE ${q(tenantDbName)}.customers SET is_active = 1 - is_active, updated_at = NOW() WHERE id = ?`,
    [customerId]
  );

  if (!result.affectedRows) return null;
  return getCustomerById(userId, customerId);
}

export async function deleteCustomer(
  userId: string,
  customerId: string
): Promise<{ deleted: boolean; deactivated: boolean }> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return { deleted: false, deactivated: false };

  const db = getControlPool();

  // Verificar si tiene citas asociadas
  const [citaRows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ${q(tenantDbName)}.appointments WHERE customer_id = ?`,
    [customerId]
  );
  const hasCitas = Number(citaRows[0]?.total ?? 0) > 0;

  if (hasCitas) {
    // Si tiene citas, marcar inactivo en lugar de eliminar
    const [result] = await db.query<ResultSetHeader>(
      `UPDATE ${q(tenantDbName)}.customers SET is_active = 0, updated_at = NOW() WHERE id = ?`,
      [customerId]
    );
    return { deleted: false, deactivated: result.affectedRows > 0 };
  }

  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.customers WHERE id = ?`,
    [customerId]
  );
  return { deleted: result.affectedRows > 0, deactivated: false };
}
