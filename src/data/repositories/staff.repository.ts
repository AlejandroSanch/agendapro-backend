import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';
import { getBusinessSettings } from './settings.repository';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type StaffRoleName = 'admin' | 'staff' | 'viewer';
export type WeekDayCode = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom';

export interface StaffScheduleDayRecord {
  dia: WeekDayCode;
  label: string;
  activo: boolean;
  desde: string;
  hasta: string;
}

export interface StaffRecord {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  rol: StaffRoleName;
  especialidades: string[];
  horarioPropio: boolean;
  horario: StaffScheduleDayRecord[];
  descansoPropio: boolean;
  descansoDesde: string | null;
  descansoHasta: string | null;
  activo: boolean;
  initials: string;
  color: string;
}

export interface CreateStaffInput {
  nombre: string;
  telefono?: string;
  email?: string;
  rol?: StaffRoleName;
  especialidades?: string[];
  horarioPropio?: boolean;
  horario?: StaffScheduleDayRecord[];
  descansoPropio?: boolean;
  descansoDesde?: string | null;
  descansoHasta?: string | null;
  activo?: boolean;
}

export type UpdateStaffInput = Partial<CreateStaffInput>;

// ── Row types ────────────────────────────────────────────────────────────────

interface StaffRow extends RowDataPacket {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_active: number;
  has_custom_schedule: number;
  role_name: string;
}

interface StaffServiceRow extends RowDataPacket {
  service_name: string;
}

interface StaffScheduleRow extends RowDataPacket {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const STAFF_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

const ROLE_NAME_TO_ID: Record<StaffRoleName, number> = {
  admin: 1,
  staff: 2,
  viewer: 3,
};

const WEEKDAY_MAP: { code: WeekDayCode; label: string; dow: number }[] = [
  { code: 'dom', label: 'Domingo', dow: 0 },
  { code: 'lun', label: 'Lunes', dow: 1 },
  { code: 'mar', label: 'Martes', dow: 2 },
  { code: 'mie', label: 'Miercoles', dow: 3 },
  { code: 'jue', label: 'Jueves', dow: 4 },
  { code: 'vie', label: 'Viernes', dow: 5 },
  { code: 'sab', label: 'Sabado', dow: 6 },
];

const DEFAULT_SCHEDULE: StaffScheduleDayRecord[] = [
  { dia: 'lun', label: 'Lunes', activo: true, desde: '09:00', hasta: '18:00' },
  { dia: 'mar', label: 'Martes', activo: true, desde: '09:00', hasta: '18:00' },
  { dia: 'mie', label: 'Miercoles', activo: true, desde: '09:00', hasta: '18:00' },
  { dia: 'jue', label: 'Jueves', activo: true, desde: '09:00', hasta: '18:00' },
  { dia: 'vie', label: 'Viernes', activo: true, desde: '09:00', hasta: '20:00' },
  { dia: 'sab', label: 'Sabado', activo: true, desde: '10:00', hasta: '16:00' },
  { dia: 'dom', label: 'Domingo', activo: false, desde: '10:00', hasta: '14:00' },
];

// ── Operaciones CRUD ─────────────────────────────────────────────────────────

export async function listStaff(userId: string): Promise<StaffRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<StaffRow[]>(
    `
      SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.is_active, s.has_custom_schedule,
             r.name AS role_name
      FROM ${q(tenantDbName)}.staff s
      JOIN ${q(tenantDbName)}.roles r ON r.id = s.role_id
      WHERE s.deleted_at IS NULL
      ORDER BY s.first_name ASC, s.last_name ASC
    `,
  );

  const results: StaffRecord[] = [];
  let i = 0;
  for (const row of rows) {
    const especialidades = await getStaffEspecialidades(tenantDbName, row.id);
    const horario = await getStaffSchedule(tenantDbName, row.id);
    const breaks = await getStaffBreaks(tenantDbName, row.id);
    results.push(toStaffRecord(row, especialidades, horario, breaks, i));
    i++;
  }

  return results;
}

export async function createStaff(
  userId: string,
  input: CreateStaffInput,
): Promise<StaffRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { firstName, lastName } = splitName(input.nombre);
    const rol: StaffRoleName = input.rol ?? 'staff';
    const roleId = ROLE_NAME_TO_ID[rol] ?? 2;
    const isActive = input.activo !== undefined ? input.activo : true;
    const hasCustomSchedule = input.horarioPropio ?? false;
    const hasCustomBreak = input.descansoPropio ?? false;

    const [result] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO ${q(tenantDbName)}.staff (
          role_id, first_name, last_name, email, phone, is_active, has_custom_schedule,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        roleId,
        firstName,
        lastName,
        input.email?.trim() || null,
        input.telefono?.trim() || null,
        isActive ? 1 : 0,
        hasCustomSchedule ? 1 : 0,
      ],
    );

    const staffId = result.insertId.toString();

    // Guardar especialidades (staff_services)
    if (input.especialidades?.length) {
      await syncStaffServices(connection, tenantDbName, staffId, input.especialidades);
    }

    // Guardar horario
    if (hasCustomSchedule && input.horario?.length) {
      await syncStaffSchedule(connection, tenantDbName, staffId, input.horario);
    }

    // Insertar descanso
    await connection.query(
      `INSERT INTO ${q(tenantDbName)}.staff_break_settings (staff_id, break_enabled, break_start, break_end, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
      [
        staffId,
        hasCustomBreak ? 1 : 0,
        input.descansoDesde ? input.descansoDesde + ':00' : null,
        input.descansoHasta ? input.descansoHasta + ':00' : null,
        '2000-01-01'
      ]
    );

    await connection.commit();

    const totalStaff = await countStaff(tenantDbName);
    const newStaff = await getStaffById(tenantDbName, staffId, totalStaff - 1);
    
    return newStaff;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateStaff(
  userId: string,
  staffId: string,
  input: UpdateStaffInput,
): Promise<StaffRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Verificar existencia
    const [existing] = await connection.query<StaffRow[]>(
      `SELECT id FROM ${q(tenantDbName)}.staff WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [staffId],
    );
    if (!existing[0]) {
      await connection.rollback();
      return null;
    }

    const sets: string[] = [];
    const params: any[] = [];

    if (input.nombre !== undefined) {
      const { firstName, lastName } = splitName(input.nombre);
      sets.push('first_name = ?', 'last_name = ?');
      params.push(firstName, lastName);
    }

    if (input.email !== undefined) {
      sets.push('email = ?');
      params.push(input.email.trim() || null);
    }

    if (input.telefono !== undefined) {
      sets.push('phone = ?');
      params.push(input.telefono.trim() || null);
    }

    if (input.rol !== undefined) {
      const roleId = ROLE_NAME_TO_ID[input.rol] ?? 2;
      sets.push('role_id = ?');
      params.push(roleId);
    }

    if (input.activo !== undefined) {
      sets.push('is_active = ?');
      params.push(input.activo ? 1 : 0);
    }

    if (input.horarioPropio !== undefined) {
      sets.push('has_custom_schedule = ?');
      params.push(input.horarioPropio ? 1 : 0);
    }



    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      params.push(staffId);
      await connection.query(
        `UPDATE ${q(tenantDbName)}.staff SET ${sets.join(', ')} WHERE id = ?`,
        params,
      );
    }

    if (input.especialidades !== undefined) {
      await syncStaffServices(connection, tenantDbName, staffId, input.especialidades);
    }

    if (input.horario !== undefined) {
      await syncStaffSchedule(connection, tenantDbName, staffId, input.horario);
    }

    // Versionar descansos
    if (input.descansoPropio !== undefined || input.descansoDesde !== undefined || input.descansoHasta !== undefined) {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const yesterdayObj = new Date(d.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

      const [activeRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, break_enabled, break_start, break_end, effective_from FROM ${q(tenantDbName)}.staff_break_settings WHERE staff_id = ? AND effective_to IS NULL LIMIT 1`,
        [staffId]
      );

      const active = activeRows.length > 0 ? activeRows[0] : null;
      
      const breakEnabled = input.descansoPropio !== undefined ? (input.descansoPropio ? 1 : 0) : (active ? active.break_enabled : 0);
      const breakStart = input.descansoDesde !== undefined ? (input.descansoDesde ? input.descansoDesde + ':00' : null) : (active?.break_start ? active.break_start.substring(0, 5) + ':00' : null);
      const breakEnd = input.descansoHasta !== undefined ? (input.descansoHasta ? input.descansoHasta + ':00' : null) : (active?.break_end ? active.break_end.substring(0, 5) + ':00' : null);

      if (!active) {
        await connection.query(
          `INSERT INTO ${q(tenantDbName)}.staff_break_settings (staff_id, break_enabled, break_start, break_end, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
          [staffId, breakEnabled, breakStart, breakEnd, todayStr]
        );
      } else {
        const dbBreakEnabled = active.break_enabled;
        const dbBreakStart = active.break_start ? active.break_start.substring(0, 5) + ':00' : null;
        const dbBreakEnd = active.break_end ? active.break_end.substring(0, 5) + ':00' : null;

        if (dbBreakEnabled !== breakEnabled || dbBreakStart !== breakStart || dbBreakEnd !== breakEnd) {
          const effFromDate = active.effective_from instanceof Date 
            ? active.effective_from.toISOString().split('T')[0] 
            : String(active.effective_from).substring(0, 10);

          if (effFromDate === todayStr) {
            await connection.query(
              `UPDATE ${q(tenantDbName)}.staff_break_settings SET break_enabled = ?, break_start = ?, break_end = ? WHERE id = ?`,
              [breakEnabled, breakStart, breakEnd, active.id]
            );
          } else {
            await connection.query(
              `UPDATE ${q(tenantDbName)}.staff_break_settings SET effective_to = ? WHERE id = ?`,
              [yesterdayStr, active.id]
            );
            await connection.query(
              `INSERT INTO ${q(tenantDbName)}.staff_break_settings (staff_id, break_enabled, break_start, break_end, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
              [staffId, breakEnabled, breakStart, breakEnd, todayStr]
            );
          }
        }
      }
    }

    await connection.commit();
    const updatedStaff = await getStaffById(tenantDbName, staffId);
    
    return updatedStaff;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function toggleStaffActive(
  userId: string,
  staffId: string,
): Promise<StaffRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `UPDATE ${q(tenantDbName)}.staff SET is_active = NOT is_active, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [staffId],
  );

  if (!result.affectedRows) return null;
  return await getStaffById(tenantDbName, staffId);
}

export async function deleteStaff(userId: string, staffId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();

  // Renombramos el staff al "borrarlo" para liberar el nombre original
  // y lo marcamos con deleted_at
  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE ${q(tenantDbName)}.staff 
      SET 
        deleted_at = NOW(),
        is_active = 0
      WHERE id = ? AND deleted_at IS NULL
    `,
    [staffId],
  );

  return result.affectedRows > 0;
}

// ── Funciones auxiliares ─────────────────────────────────────────────────────

async function getStaffById(
  tenantDbName: string,
  staffId: string,
  colorIndex?: number,
): Promise<StaffRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<StaffRow[]>(
    `
      SELECT s.id, s.first_name, s.last_name, s.email, s.phone, s.is_active, s.has_custom_schedule,
             r.name AS role_name
      FROM ${q(tenantDbName)}.staff s
      JOIN ${q(tenantDbName)}.roles r ON r.id = s.role_id
      WHERE s.id = ? LIMIT 1
    `,
    [staffId],
  );

  const row = rows[0];
  if (!row) return null;

  const especialidades = await getStaffEspecialidades(tenantDbName, staffId);
  const horario = await getStaffSchedule(tenantDbName, staffId);
  const breaks = await getStaffBreaks(tenantDbName, staffId);

  // Determine color index if not given
  if (colorIndex === undefined) {
    const [allRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM ${q(tenantDbName)}.staff WHERE deleted_at IS NULL ORDER BY created_at ASC`,
    );
    colorIndex = allRows.findIndex((r) => String(r.id) === String(staffId));
    if (colorIndex < 0) colorIndex = 0;
  }

  return toStaffRecord(row, especialidades, horario, breaks, colorIndex);
}

async function getStaffEspecialidades(tenantDbName: string, staffId: string): Promise<string[]> {
  const db = getControlPool();
  const [rows] = await db.query<StaffServiceRow[]>(
    `
      SELECT sv.name AS service_name
      FROM ${q(tenantDbName)}.staff_services ss
      JOIN ${q(tenantDbName)}.services sv ON sv.id = ss.service_id
      WHERE ss.staff_id = ?
      ORDER BY sv.name ASC
    `,
    [staffId],
  );
  return rows.map((r) => r.service_name);
}

async function getStaffBreaks(tenantDbName: string, staffId: string): Promise<{ enabled: boolean; start: string | null; end: string | null }> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT break_enabled, break_start, break_end FROM ${q(tenantDbName)}.staff_break_settings WHERE staff_id = ? AND effective_to IS NULL LIMIT 1`,
    [staffId]
  );
  if (rows.length > 0) {
    const row = rows[0]!;
    return {
      enabled: row.break_enabled === 1,
      start: row.break_start ? String(row.break_start).substring(0, 5) : null,
      end: row.break_end ? String(row.break_end).substring(0, 5) : null,
    };
  }
  return { enabled: false, start: null, end: null };
}

async function getStaffSchedule(
  tenantDbName: string,
  staffId: string,
): Promise<StaffScheduleDayRecord[]> {
  const db = getControlPool();
  const [rows] = await db.query<StaffScheduleRow[]>(
    `
      SELECT id, day_of_week, start_time, end_time
      FROM ${q(tenantDbName)}.staff_schedules
      WHERE staff_id = ? AND effective_to IS NULL
      ORDER BY day_of_week ASC
    `,
    [staffId],
  );

  // Construir un mapa para mergearlo con los 7 días de la semana
  const scheduleMap = new Map<number, { start: string; end: string }>();
  for (const row of rows) {
    scheduleMap.set(row.day_of_week, {
      start: formatTimeToHHMM(row.start_time),
      end: formatTimeToHHMM(row.end_time),
    });
  }

  // Si no hay registros propios, devolver horario por defecto
  if (scheduleMap.size === 0) {
    return DEFAULT_SCHEDULE.map((d) => ({ ...d }));
  }

  return WEEKDAY_MAP.map((wd) => {
    const entry = scheduleMap.get(wd.dow);
    return {
      dia: wd.code,
      label: wd.label,
      activo: !!entry,
      desde: entry?.start ?? '09:00',
      hasta: entry?.end ?? '18:00',
    };
  });
}

async function syncStaffServices(
  connection: any,
  tenantDbName: string,
  staffId: string,
  serviceNames: string[],
): Promise<void> {
  // Borrar las existentes
  await connection.query(`DELETE FROM ${q(tenantDbName)}.staff_services WHERE staff_id = ?`, [
    staffId,
  ]);

  if (!serviceNames.length) return;

  // Buscar service IDs por nombre
  const placeholders = serviceNames.map(() => '?').join(', ');
  const [serviceRows] = await connection.query(
    `SELECT id, name FROM ${q(tenantDbName)}.services WHERE name IN (${placeholders})`,
    serviceNames,
  );

  for (const svc of serviceRows) {
    await connection.query(
      `INSERT IGNORE INTO ${q(tenantDbName)}.staff_services (staff_id, service_id) VALUES (?, ?)`,
      [staffId, svc.id],
    );
  }
}

async function syncStaffSchedule(
  connection: any,
  tenantDbName: string,
  staffId: string,
  horario: StaffScheduleDayRecord[],
): Promise<void> {
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterdayObj = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

  for (const h of horario) {
    const wd = WEEKDAY_MAP.find((w) => w.code === h.dia);
    if (!wd) continue;

    const [activeRows] = await connection.query(
      `SELECT id, start_time, end_time, effective_from FROM ${q(tenantDbName)}.staff_schedules WHERE staff_id = ? AND day_of_week = ? AND effective_to IS NULL LIMIT 1`,
      [staffId, wd.dow]
    );

    if (!h.activo) {
      if (activeRows.length > 0) {
        // Cerrar horario activo si ahora está inactivo
        const active = activeRows[0];
        const effFromDate = active.effective_from instanceof Date 
            ? active.effective_from.toISOString().split('T')[0] 
            : String(active.effective_from).substring(0, 10);
        
        if (effFromDate === todayStr) {
          await connection.query(`DELETE FROM ${q(tenantDbName)}.staff_schedules WHERE id = ?`, [active.id]);
        } else {
          await connection.query(`UPDATE ${q(tenantDbName)}.staff_schedules SET effective_to = ? WHERE id = ?`, [yesterdayStr, active.id]);
        }
      }
      continue;
    }

    const openTime = h.desde + ':00';
    const closeTime = h.hasta + ':00';

    if (activeRows.length > 0) {
      const active = activeRows[0];
      const dbStart = active.start_time.substring(0, 5) + ':00';
      const dbEnd = active.end_time.substring(0, 5) + ':00';

      if (dbStart === openTime && dbEnd === closeTime) {
        continue;
      }

      const effFromDate = active.effective_from instanceof Date 
            ? active.effective_from.toISOString().split('T')[0] 
            : String(active.effective_from).substring(0, 10);

      if (effFromDate === todayStr) {
        await connection.query(
          `UPDATE ${q(tenantDbName)}.staff_schedules SET start_time = ?, end_time = ? WHERE id = ?`,
          [openTime, closeTime, active.id]
        );
      } else {
        await connection.query(`UPDATE ${q(tenantDbName)}.staff_schedules SET effective_to = ? WHERE id = ?`, [yesterdayStr, active.id]);
        await connection.query(
          `INSERT INTO ${q(tenantDbName)}.staff_schedules (staff_id, day_of_week, start_time, end_time, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
          [staffId, wd.dow, openTime, closeTime, todayStr]
        );
      }
    } else {
      await connection.query(
        `INSERT INTO ${q(tenantDbName)}.staff_schedules (staff_id, day_of_week, start_time, end_time, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, NULL)`,
        [staffId, wd.dow, openTime, closeTime, '2000-01-01']
      );
    }
  }
}

async function countStaff(tenantDbName: string): Promise<number> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM ${q(tenantDbName)}.staff WHERE deleted_at IS NULL`,
  );
  return Number(rows[0]?.total ?? 0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/);
  const p0 = parts[0] || '';
  if (parts.length <= 1) {
    return { firstName: p0, lastName: '' };
  }
  return { firstName: p0, lastName: parts.slice(1).join(' ') };
}

function computeInitials(firstName: string, lastName: string): string {
  const f = String(firstName || '').trim();
  const l = String(lastName || '').trim();

  if (!f && !l) return '??';
  if (!l) return f.slice(0, 2).toUpperCase();
  return (f.charAt(0) + l.charAt(0)).toUpperCase();
}

function formatTimeToHHMM(timeStr: string): string {
  // MySQL TIME puede devolver "09:00:00" - truncar a "09:00"
  return String(timeStr || '00:00').slice(0, 5);
}

function toStaffRecord(
  row: StaffRow,
  especialidades: string[],
  horario: StaffScheduleDayRecord[],
  breaks: { enabled: boolean; start: string | null; end: string | null },
  colorIndex: number,
): StaffRecord {
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
  return {
    id: String(row.id),
    nombre: fullName,
    telefono: row.phone ?? '',
    email: row.email ?? '',
    rol: (row.role_name as StaffRoleName) || 'staff',
    especialidades,
    horarioPropio: row.has_custom_schedule === 1,
    horario,
    descansoPropio: breaks.enabled,
    descansoDesde: breaks.start ? formatTimeToHHMM(breaks.start) : null,
    descansoHasta: breaks.end ? formatTimeToHHMM(breaks.end) : null,
    activo: row.is_active === 1,
    initials: computeInitials(row.first_name, row.last_name),
    color: STAFF_COLORS[Math.abs(colorIndex) % STAFF_COLORS.length] || '#CCCCCC',
  };
}




