import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface StaffBlock {
  id: number;
  staffId: number;
  title: string;
  startAt: string;
  endAt: string;
}

export interface CreateStaffBlockInput {
  staffId: number;
  title: string;
  startAt: string;
  endAt: string;
}

export async function listStaffBlocks(
  userId: string,
  filters: { staffId?: number; dateFrom?: string; dateTo?: string },
): Promise<StaffBlock[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const whereParts: string[] = [];
  const params: any[] = [];

  if (filters.staffId) {
    whereParts.push('staff_id = ?');
    params.push(filters.staffId);
  }
  if (filters.dateFrom) {
    whereParts.push('DATE(start_at) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    whereParts.push('DATE(start_at) <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, staff_id as staffId, title, DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') as startAt, DATE_FORMAT(end_at, '%Y-%m-%d %H:%i:%s') as endAt
     FROM ${q(tenantDbName)}.staff_blocks ${whereClause} ORDER BY start_at ASC`,
    params,
  );

  const manualBlocks = rows as StaffBlock[];

  // ── Calculate dynamic break blocks ──
  // Determine date range to compute (default to +/- 15 days if not provided)
  const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  const toDate = filters.dateTo ? new Date(filters.dateTo) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  
  // Normalize times
  fromDate.setHours(0,0,0,0);
  toDate.setHours(23,59,59,999);
  
  const fromStr = fromDate.toISOString().split('T')[0];
  const toStr = toDate.toISOString().split('T')[0];

  // Fetch break settings
  const [breakRows] = await db.query<RowDataPacket[]>(
    `SELECT staff_id, break_enabled, break_start, break_end, effective_from, effective_to 
     FROM ${q(tenantDbName)}.staff_break_settings 
     WHERE (staff_id = ? OR ? OR staff_id IS NULL) 
       AND effective_from <= ? 
       AND (effective_to IS NULL OR effective_to >= ?)`,
    [filters.staffId || 0, filters.staffId ? false : true, toStr, fromStr]
  );

  // Fetch schedules
  const [scheduleRows] = await db.query<RowDataPacket[]>(
    `SELECT staff_id, day_of_week, start_time, end_time, effective_from, effective_to
     FROM ${q(tenantDbName)}.staff_schedules
     WHERE (staff_id = ? OR ?)
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)`,
    [filters.staffId || 0, filters.staffId ? false : true, toStr, fromStr]
  );

  // If no staffId filter, we need all active staff to know who to generate breaks for
  let staffIds: number[] = [];
  if (filters.staffId) {
    staffIds.push(filters.staffId);
  } else {
    const [staffRows] = await db.query<RowDataPacket[]>(`SELECT id FROM ${q(tenantDbName)}.staff WHERE deleted_at IS NULL`);
    staffIds = staffRows.map(r => r.id);
  }

  const dynamicBlocks: StaffBlock[] = [];
  let nextFakeId = -1; // Use negative IDs for dynamic blocks so they don't collide with DB IDs

  // Iterate over each date in range
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    const currentStr = d.toISOString().substring(0, 10);
    const dowMap = [0, 1, 2, 3, 4, 5, 6]; // Date.getDay() 0=Sun, 6=Sat
    // MySQL day_of_week is 0=Sun, 6=Sat according to WEEKDAY_MAP
    const currentDow = dowMap[d.getDay()];

    for (const sid of staffIds) {
      // Find active schedule for this staff on this day
      const schedule = scheduleRows.find(s => {
        const effFrom = new Date(s.effective_from);
        const effTo = s.effective_to ? new Date(s.effective_to) : null;
        return s.staff_id === sid && 
               s.day_of_week === currentDow && 
               effFrom <= d && 
               (!effTo || effTo >= d);
      });

      // If they don't work this day, no break block needed
      if (!schedule) continue;

      // Find active break settings for this staff
      const staffBreak = breakRows.find(b => {
        const effFrom = new Date(b.effective_from);
        const effTo = b.effective_to ? new Date(b.effective_to) : null;
        return b.staff_id === sid &&
               effFrom <= d && 
               (!effTo || effTo >= d);
      });

      // Find active global break settings
      const globalBreak = breakRows.find(b => {
        const effFrom = new Date(b.effective_from);
        const effTo = b.effective_to ? new Date(b.effective_to) : null;
        return b.staff_id === null &&
               effFrom <= d && 
               (!effTo || effTo >= d);
      });

      const activeBreak = staffBreak && staffBreak.break_enabled === 1 ? staffBreak : 
                         (staffBreak ? null : (globalBreak && globalBreak.break_enabled === 1 ? globalBreak : null));

      if (activeBreak && activeBreak.break_start && activeBreak.break_end) {
        const breakStart = activeBreak.break_start.substring(0, 5);
        const breakEnd = activeBreak.break_end.substring(0, 5);

        dynamicBlocks.push({
          id: nextFakeId--,
          staffId: sid,
          title: 'Descanso',
          startAt: `${currentStr} ${breakStart}:00`,
          endAt: `${currentStr} ${breakEnd}:00`,
          isRecurrent: 1
        });
      }
    }
  }

  // Combine and sort
  const allBlocks = [...manualBlocks, ...dynamicBlocks];
  allBlocks.sort((a, b) => a.startAt.localeCompare(b.startAt));

  return allBlocks;
}

export async function createStaffBlock(
  userId: string,
  input: CreateStaffBlockInput,
): Promise<StaffBlock | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `INSERT INTO ${q(tenantDbName)}.staff_blocks (staff_id, title, start_at, end_at) VALUES (?, ?, ?, ?)`,
    [input.staffId, input.title, input.startAt, input.endAt],
  );

  return {
    id: result.insertId,
    ...input
  };
}

export async function deleteStaffBlock(userId: string, id: number): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `DELETE FROM ${q(tenantDbName)}.staff_blocks WHERE id = ?`,
    [id],
  );

  return result.affectedRows > 0;
}


