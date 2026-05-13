import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';
import { syncAllStaffRecurrentBlocks } from './staff.repository';

export interface BusinessSettings {
  businessType: string;
  phone: string;
  address: string;
  street: string;
  extNumber: string;
  intNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  logoUrl: string;
  schedules: BusinessSchedule[];
  breakEnabled: boolean;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface BusinessSchedule {
  day: number; // 0=Lun, 6=Dom
  open: boolean;
  from: string;
  to: string;
}

export interface StaffRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  specialties: string[];
  isActive: boolean;
}

export interface CreateStaffInput {
  fullName: string;
  email?: string;
  phone?: string;
  role?: string;
  specialties?: string[];
}

export async function getOnboardingStatus(userId: string): Promise<boolean> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT onboarding_completed FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  return rows[0]?.onboarding_completed === 1;
}

export async function setOnboardingCompleted(userId: string): Promise<void> {
  const db = getControlPool();
  await db.query(`UPDATE users SET onboarding_completed = 1, updated_at = NOW() WHERE id = ?`, [
    userId,
  ]);
}

export async function getBusinessSettings(userId: string): Promise<BusinessSettings | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM ${q(tenantDbName)}.business_settings LIMIT 1`,
  );

  const row = rows[0];
  if (!row) return null;

  // Cargar schedules desde la nueva tabla
  const [hoursRows] = await db.query<RowDataPacket[]>(
    `SELECT day_of_week, open_time, close_time, is_closed FROM ${q(tenantDbName)}.business_hours ORDER BY day_of_week ASC`,
  );

  const schedules: BusinessSchedule[] = hoursRows.map((h) => ({
    day: h.day_of_week,
    open: h.is_closed === 0,
    from: h.open_time ? h.open_time.substring(0, 5) : '09:00',
    to: h.close_time ? h.close_time.substring(0, 5) : '18:00',
  }));

  return {
    businessType: row.business_type ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    street: row.street ?? '',
    extNumber: row.ext_number ?? '',
    intNumber: row.int_number ?? '',
    neighborhood: row.neighborhood ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zipCode: row.zip_code ?? '',
    logoUrl: row.logo_url ?? '',
    schedules,
    breakEnabled: row.break_enabled === 1,
    breakStart: row.break_start ? String(row.break_start).substring(0, 5) : null,
    breakEnd: row.break_end ? String(row.break_end).substring(0, 5) : null,
  };
}

export async function upsertBusinessSettings(
  userId: string,
  input: Partial<BusinessSettings>,
): Promise<BusinessSettings | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const current = (await getBusinessSettings(userId)) ?? {
    businessType: '',
    phone: '',
    address: '',
    street: '',
    extNumber: '',
    intNumber: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    logoUrl: '',
    schedules: [],
    breakEnabled: false,
    breakStart: null,
    breakEnd: null,
  };

  const next = {
    businessType: input.businessType ?? current.businessType,
    phone: input.phone ?? current.phone,
    address: input.address ?? current.address,
    street: input.street ?? current.street,
    extNumber: input.extNumber ?? current.extNumber,
    intNumber: input.intNumber ?? current.intNumber,
    neighborhood: input.neighborhood ?? current.neighborhood,
    city: input.city ?? current.city,
    state: input.state ?? current.state,
    zipCode: input.zipCode ?? current.zipCode,
    logoUrl: input.logoUrl ?? current.logoUrl,
    schedules: input.schedules ?? current.schedules,
    breakEnabled: input.breakEnabled ?? current.breakEnabled,
    breakStart: input.breakStart !== undefined ? input.breakStart : current.breakStart,
    breakEnd: input.breakEnd !== undefined ? input.breakEnd : current.breakEnd,
  };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `
        INSERT INTO ${q(tenantDbName)}.business_settings
          (id, business_type, phone, address, street, ext_number, int_number, neighborhood, city, state, zip_code, logo_url, break_enabled, break_start, break_end, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          business_type = VALUES(business_type),
          phone = VALUES(phone),
          address = VALUES(address),
          street = VALUES(street),
          ext_number = VALUES(ext_number),
          int_number = VALUES(int_number),
          neighborhood = VALUES(neighborhood),
          city = VALUES(city),
          state = VALUES(state),
          zip_code = VALUES(zip_code),
          logo_url = VALUES(logo_url),
          break_enabled = VALUES(break_enabled),
          break_start = VALUES(break_start),
          break_end = VALUES(break_end),
          updated_at = NOW()
      `,
      [
        next.businessType,
        next.phone,
        next.address,
        next.street,
        next.extNumber,
        next.intNumber,
        next.neighborhood,
        next.city,
        next.state,
        next.zipCode,
        next.logoUrl,
        next.breakEnabled ? 1 : 0,
        next.breakStart ? next.breakStart + ':00' : null,
        next.breakEnd ? next.breakEnd + ':00' : null,
      ],
    );

    // Save Schedules to new table
    await connection.query(`DELETE FROM ${q(tenantDbName)}.business_hours`);
    if (next.schedules.length > 0) {
      for (const sch of next.schedules) {
        await connection.query(
          `INSERT INTO ${q(tenantDbName)}.business_hours (day_of_week, open_time, close_time, is_closed) VALUES (?, ?, ?, ?)`,
          [sch.day, sch.from || '00:00', sch.to || '00:00', sch.open ? 0 : 1],
        );
      }
    }

    await connection.commit();
    
    // Sync all staff blocks if break settings changed
    if (
      next.breakEnabled !== current.breakEnabled ||
      next.breakStart !== current.breakStart ||
      next.breakEnd !== current.breakEnd
    ) {
      await syncAllStaffRecurrentBlocks(userId);
    }

    return getBusinessSettings(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listStaff(userId: string): Promise<StaffRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) as full_name, s.email, s.phone, r.name as role, '' as specialties, s.is_active
      FROM ${q(tenantDbName)}.staff s
      LEFT JOIN ${q(tenantDbName)}.roles r ON s.role_id = r.id
      ORDER BY s.first_name ASC
    `,
  );

  return rows.map(rowToStaffRecord);
}

export async function createStaffMember(
  userId: string,
  input: CreateStaffInput,
): Promise<StaffRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  let roleId: string;
  const [roleRows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM ${q(tenantDbName)}.roles WHERE name = ? LIMIT 1`,
    [input.role || 'staff'],
  );
  if (!roleRows[0]) {
    const [roleResult] = await db.query<ResultSetHeader>(
      `INSERT INTO ${q(tenantDbName)}.roles (name) VALUES (?)`,
      [input.role || 'staff'],
    );
    roleId = roleResult.insertId.toString();
  } else {
    roleId = String(roleRows[0].id);
  }

  const nameParts = String(input.fullName || '')
    .trim()
    .split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const [staffResult] = await db.query<ResultSetHeader>(
    `
      INSERT INTO ${q(tenantDbName)}.staff (role_id, first_name, last_name, email, phone, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())
    `,
    [roleId, firstName, lastName, input.email || null, input.phone || null],
  );

  const staffId = staffResult.insertId.toString();

  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) as full_name, s.email, s.phone, r.name as role, '' as specialties, s.is_active
      FROM ${q(tenantDbName)}.staff s
      LEFT JOIN ${q(tenantDbName)}.roles r ON s.role_id = r.id
      WHERE s.id = ? LIMIT 1
    `,
    [staffId],
  );

  return rows[0] ? rowToStaffRecord(rows[0] as RowDataPacket) : null;
}

function rowToStaffRecord(row: RowDataPacket): StaffRecord {
  let specialties: string[];
  try {
    specialties = JSON.parse(row.specialties || '[]');
  } catch {
    specialties = [];
  }

  return {
    id: String(row.id),
    fullName: row.full_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role ?? 'staff',
    specialties,
    isActive: row.is_active === 1,
  };
}
export async function isHolidayClosure(userId: string, date: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id FROM ${q(tenantDbName)}.holidays_closures WHERE closure_date = ? LIMIT 1`,
    [date],
  );
  return rows.length > 0;
}

/**
 * Función de utilidad para insertar cierres de prueba.
 */
export async function seedHolidayClosures(userId: string, dates: string[]): Promise<void> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return;

  const db = getControlPool();
  for (const date of dates) {
    await db.query(
      `INSERT IGNORE INTO ${q(tenantDbName)}.holidays_closures (closure_date, reason) VALUES (?, ?)`,
      [date, 'Cierres de prueba - Mantenimiento'],
    );
  }
}
