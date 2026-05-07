import { randomUUID } from 'crypto';
import { compareSync, hashSync } from 'bcryptjs';
import { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { PlanId } from '../types';

export const SALT_ROUNDS = 10;

export type AppointmentStatusDb =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export function normalizePlan(value: unknown): PlanId {
  if (value === 'starter' || value === 'pro' || value === 'enterprise') return value as PlanId;
  return 'starter';
}

export function normalizeAppointmentStatus(value: unknown): AppointmentStatusDb {
  if (
    value === 'scheduled' ||
    value === 'confirmed' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'no_show'
  ) {
    return value as AppointmentStatusDb;
  }
  return 'scheduled';
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function normalizeServiceCategory(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'general') return 'General';
  return raw;
}

export function tenantDbNameFromUserId(userId: string): string {
  const safeId = String(userId || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  return `${env.mysqlTenantDbPrefix}${safeId}`;
}

export function initialsFromName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function isPasswordHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

export function hashPassword(password: string): string {
  if (env.storePlaintextPasswords) return password;
  return hashSync(password, SALT_ROUNDS);
}

export function verifyPasswordPlain(hashed: string, password: string): boolean {
  if (isPasswordHash(hashed)) {
    return compareSync(password, hashed);
  }
  return hashed === password;
}

export function generateEmailVerificationToken(): string {
  return randomUUID().replace(/-/g, '');
}

export function q(identifier: string): string {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

export function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ER_DUP_ENTRY';
}

export function isPrimaryKeyDuplicateError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) return false;

  const detail = String(
    (error as { sqlMessage?: string; message?: string })?.sqlMessage ??
    (error as { message?: string })?.message ??
    ''
  );

  return detail.toLowerCase().includes("for key 'primary'");
}

export function isUsersEmailDuplicateError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) return false;

  const detail = String(
    (error as { sqlMessage?: string; message?: string })?.sqlMessage ??
    (error as { message?: string })?.message ??
    ''
  ).toLowerCase();

  return detail.includes("for key 'email'") || detail.includes("for key 'users.email'");
}

function escapeRegexForMySql(value: string): string {
  return String(value).replace(/[\\.^$*+?()[\]{}|]/g, '\\$&');
}

interface MaxIdRow extends RowDataPacket {
  max_value: number | string | null;
}

export async function nextSequentialId(
  executor: Pool | PoolConnection,
  tableRef: string,
  prefix: string,
  minDigits = 3
): Promise<string> {
  const normalizedPrefix = String(prefix || '').trim().toLowerCase();
  const startPosition = normalizedPrefix.length + 1;
  const regex = `^${escapeRegexForMySql(normalizedPrefix)}[0-9]+$`;

  const [rows] = await executor.query<MaxIdRow[]>(
    `
      SELECT COALESCE(MAX(CAST(SUBSTRING(id, ?) AS UNSIGNED)), 0) AS max_value
      FROM ${tableRef}
      WHERE id REGEXP ?
    `,
    [startPosition, regex]
  );

  const current = Number(rows[0]?.max_value ?? 0);
  const nextValue = Number.isFinite(current) ? current + 1 : 1;
  return `${normalizedPrefix}${String(nextValue).padStart(minDigits, '0')}`;
}

export function composeMySqlDateTime(date: string, time: string): string {
  return `${date} ${time}:00`;
}

export function splitMySqlDateTime(value: string): { date: string; time: string } {
  const normalized = value.includes('T') ? value.replace('T', ' ') : value;
  const [datePart = '', timePart = '00:00:00'] = normalized.split(' ');

  return {
    date: datePart,
    time: timePart.slice(0, 5),
  };
}

export function addMinutesToMySqlDateTime(startAt: string, minutes: number): string {
  const start = new Date(startAt.replace(' ', 'T'));
  const end = new Date(start.getTime() + minutes * 60_000);

  const yyyy = end.getFullYear();
  const mm = `${end.getMonth() + 1}`.padStart(2, '0');
  const dd = `${end.getDate()}`.padStart(2, '0');
  const hh = `${end.getHours()}`.padStart(2, '0');
  const min = `${end.getMinutes()}`.padStart(2, '0');
  const ss = `${end.getSeconds()}`.padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}
