import { randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import { getControlPool } from '../db';
import { q } from '../utils';
import { getTenantDbNameByUserId } from './user.repository';

export interface BusinessSettings {
  businessType: string;
  phone: string;
  address: string;
  logoUrl: string;
  schedules: BusinessSchedule[];
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
    [userId]
  );
  return rows[0]?.onboarding_completed === 1;
}

export async function setOnboardingCompleted(userId: string): Promise<void> {
  const db = getControlPool();
  await db.query(`UPDATE users SET onboarding_completed = 1, updated_at = NOW() WHERE id = ?`, [userId]);
}

export async function getBusinessSettings(userId: string): Promise<BusinessSettings | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT * FROM ${q(tenantDbName)}.business_settings LIMIT 1`
  );

  const row = rows[0];
  if (!row) return null;

  let schedules: BusinessSchedule[] = [];
  try {
    schedules = JSON.parse(row.schedules || '[]');
  } catch {
    schedules = [];
  }

  return {
    businessType: row.business_type ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    logoUrl: row.logo_url ?? '',
    schedules,
  };
}

export async function upsertBusinessSettings(
  userId: string,
  input: Partial<BusinessSettings>
): Promise<BusinessSettings | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const current = (await getBusinessSettings(userId)) ?? {
    businessType: '',
    phone: '',
    address: '',
    logoUrl: '',
    schedules: [],
  };

  const next = {
    businessType: input.businessType ?? current.businessType,
    phone: input.phone ?? current.phone,
    address: input.address ?? current.address,
    logoUrl: input.logoUrl ?? current.logoUrl,
    schedules: input.schedules ?? current.schedules,
  };

  await db.query(
    `
      INSERT INTO ${q(tenantDbName)}.business_settings (id, business_type, phone, address, logo_url, schedules, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        business_type = VALUES(business_type),
        phone = VALUES(phone),
        address = VALUES(address),
        logo_url = VALUES(logo_url),
        schedules = VALUES(schedules),
        updated_at = NOW()
    `,
    [next.businessType, next.phone, next.address, next.logoUrl, JSON.stringify(next.schedules)]
  );

  return getBusinessSettings(userId);
}

export async function listStaff(userId: string): Promise<StaffRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT id, full_name, email, phone, role, specialties, is_active
      FROM ${q(tenantDbName)}.staff
      ORDER BY full_name ASC
    `
  );

  return rows.map(rowToStaffRecord);
}

export async function createStaffMember(
  userId: string,
  input: CreateStaffInput
): Promise<StaffRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const staffId = `stf_${randomUUID()}`;

  await db.query(
    `
      INSERT INTO ${q(tenantDbName)}.staff (id, full_name, email, phone, role, specialties, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `,
    [
      staffId,
      String(input.fullName || '').trim(),
      input.email || null,
      input.phone || null,
      input.role || 'staff',
      JSON.stringify(input.specialties ?? []),
    ]
  );

  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT id, full_name, email, phone, role, specialties, is_active
      FROM ${q(tenantDbName)}.staff WHERE id = ? LIMIT 1
    `,
    [staffId]
  );

  return rows[0] ? rowToStaffRecord(rows[0] as RowDataPacket) : null;
}

function rowToStaffRecord(row: RowDataPacket): StaffRecord {
  let specialties: string[] = [];
  try {
    specialties = JSON.parse(row.specialties || '[]');
  } catch {
    specialties = [];
  }

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    role: row.role ?? 'staff',
    specialties,
    isActive: row.is_active === 1,
  };
}
