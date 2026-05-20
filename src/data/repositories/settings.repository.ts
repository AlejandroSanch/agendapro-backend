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
  historicalSchedules?: HistoricalSchedule[];
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

export interface HistoricalSchedule extends BusinessSchedule {
  effectiveFrom: string;
  effectiveTo: string | null;
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

export async function getBusinessSettings(userId: string, targetDate?: string): Promise<BusinessSettings | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM ${q(tenantDbName)}.business_settings LIMIT 1`,
  );

  const row = rows[0];
  if (!row) return null;

  // Cargar schedules desde la nueva tabla, opcionalmente por fecha
  let query = `SELECT day_of_week, open_time, close_time, is_closed FROM ${q(tenantDbName)}.business_hours`;
  const params: any[] = [];
  
  if (targetDate) {
    query += ` WHERE effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?) ORDER BY day_of_week ASC`;
    params.push(targetDate, targetDate);
  } else {
    query += ` WHERE effective_to IS NULL ORDER BY day_of_week ASC`;
  }

  const [hoursRows] = await db.query<RowDataPacket[]>(query, params);

  let schedulesRows: any[] = hoursRows;
  // Fallback si no hay registros activos para esa fecha histórica
  if (schedulesRows.length === 0) {
    const [fallbackRows] = await db.query<RowDataPacket[]>(
      `SELECT day_of_week, open_time, close_time, is_closed FROM ${q(tenantDbName)}.business_hours ORDER BY effective_from ASC, day_of_week ASC`
    );
    const map: Record<number, any> = {};
    for (const r of fallbackRows) {
      if (map[r.day_of_week] === undefined) {
        map[r.day_of_week] = r;
      }
    }
    schedulesRows = Object.values(map);
  }

  // Fallback secundario con defaults
  if (schedulesRows.length === 0) {
    schedulesRows = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      open_time: '09:00:00',
      close_time: '18:00:00',
      is_closed: i === 6 ? 1 : 0,
    }));
  }

  const schedules: BusinessSchedule[] = schedulesRows.map((h) => ({
    day: h.day_of_week,
    open: h.is_closed === 0,
    from: h.open_time ? h.open_time.substring(0, 5) : '09:00',
    to: h.close_time ? h.close_time.substring(0, 5) : '18:00',
  }));

  const [historyRows] = await db.query<RowDataPacket[]>(
    `SELECT day_of_week, open_time, close_time, is_closed, effective_from, effective_to FROM ${q(tenantDbName)}.business_hours ORDER BY effective_from ASC, day_of_week ASC`
  );

  const historicalSchedules: HistoricalSchedule[] = historyRows.map((h) => {
    const fromStr = h.effective_from instanceof Date ? h.effective_from.toISOString().split('T')[0] : String(h.effective_from).substring(0, 10);
    const toStr = h.effective_to ? (h.effective_to instanceof Date ? h.effective_to.toISOString().split('T')[0] : String(h.effective_to).substring(0, 10)) : null;

    return {
      day: h.day_of_week,
      open: h.is_closed === 0,
      from: h.open_time ? h.open_time.substring(0, 5) : '09:00',
      to: h.close_time ? h.close_time.substring(0, 5) : '18:00',
      effectiveFrom: fromStr,
      effectiveTo: toStr,
    };
  });

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
    historicalSchedules,
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

    // Guardar/Versionar horarios en business_hours
    if (next.schedules.length > 0) {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const yesterdayObj = new Date(d.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

      for (const sch of next.schedules) {
        const day = sch.day;
        const openTime = sch.from || '09:00';
        const closeTime = sch.to || '18:00';
        const isClosed = sch.open ? 0 : 1;

        // Buscar si ya existe un horario activo actual
        const [activeRows] = await connection.query<RowDataPacket[]>(
          `SELECT id, open_time, close_time, is_closed, effective_from FROM ${q(tenantDbName)}.business_hours WHERE day_of_week = ? AND effective_to IS NULL LIMIT 1`,
          [day]
        );

        if (activeRows.length > 0) {
          const active = activeRows[0]!;
          const dbOpen = active.open_time ? active.open_time.substring(0, 5) : '09:00';
          const dbClose = active.close_time ? active.close_time.substring(0, 5) : '18:00';
          const dbIsClosed = active.is_closed;

          // Si la configuración es idéntica, no hacemos cambios
          if (dbOpen === openTime && dbClose === closeTime && dbIsClosed === isClosed) {
            continue;
          }

          // Convertir fecha de DB a string YYYY-MM-DD
          const effFromDate = active.effective_from instanceof Date 
            ? active.effective_from.toISOString().split('T')[0] 
            : String(active.effective_from).substring(0, 10);

          if (effFromDate === todayStr) {
            // Si el horario activo empezó hoy, lo sobreescribimos directamente
            await connection.query(
              `UPDATE ${q(tenantDbName)}.business_hours SET open_time = ?, close_time = ?, is_closed = ? WHERE id = ?`,
              [openTime, closeTime, isClosed, active.id]
            );
          } else {
            // Cerramos el horario anterior (ayer)
            await connection.query(
              `UPDATE ${q(tenantDbName)}.business_hours SET effective_to = ? WHERE id = ?`,
              [yesterdayStr, active.id]
            );
            // Insertamos la nueva versión activa desde hoy
            await connection.query(
              `INSERT INTO ${q(tenantDbName)}.business_hours (day_of_week, open_time, close_time, is_closed, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
              [day, openTime, closeTime, isClosed, todayStr]
            );
          }
        } else {
          // Si no hay horario activo (onboarding inicial), insertamos uno desde el pasado o hoy
          await connection.query(
            `INSERT INTO ${q(tenantDbName)}.business_hours (day_of_week, open_time, close_time, is_closed, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
            [day, openTime, closeTime, isClosed, '2000-01-01']
          );
        }
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
