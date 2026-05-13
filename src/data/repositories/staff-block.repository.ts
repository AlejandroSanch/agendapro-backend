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

  return rows as StaffBlock[];
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
    ...input,
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
