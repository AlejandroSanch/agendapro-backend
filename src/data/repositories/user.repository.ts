import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { ModuleId, PlanId, UserPublic, UserRecord } from '../../types';
import { getControlPool } from '../db';
import {
  generateEmailVerificationToken,
  hashPassword,
  initialsFromName,
  isDuplicateKeyError,
  isPrimaryKeyDuplicateError,
  isUsersEmailDuplicateError,
  nextSequentialId,
  normalizeEmail,
  normalizePlan,
  q,
  tenantDbNameFromUserId,
} from '../utils';
import { ensureTenantSchema } from '../schema';

const tenantCache = new Map<string, string>();

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  businessName: string;
  acceptTerms: boolean;
  plan?: PlanId;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password: string;
  email_verified: number;
  email_verification_token: string | null;
  terms_accepted_at: string | null;
  plan: string;
  business_name: string;
  avatar_initials: string | null;
  trial_end_date: string | null;
  tenant_db_name: string;
}

interface TenantRefRow extends RowDataPacket {
  id: string;
  tenant_db_name: string;
}

interface ModuleOverrideRow extends RowDataPacket {
  module_id: string;
  enabled: number;
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const db = getControlPool();
  const [rows] = await db.query<UserRow[]>(
    `
      SELECT id, name, email, password, email_verified, email_verification_token, terms_accepted_at, plan, business_name, avatar_initials, trial_end_date, tenant_db_name
      FROM users WHERE email = ? LIMIT 1
    `,
    [normalizeEmail(email)]
  );

  const row = rows[0];
  if (!row) return undefined;
  const overrides = await getModuleOverrides(row.id);
  return rowToUserRecord(row, overrides);
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const db = getControlPool();
  const [rows] = await db.query<UserRow[]>(
    `
      SELECT id, name, email, password, email_verified, email_verification_token, terms_accepted_at, plan, business_name, avatar_initials, trial_end_date, tenant_db_name
      FROM users WHERE id = ? LIMIT 1
    `,
    [id]
  );

  const row = rows[0];
  if (!row) return undefined;
  const overrides = await getModuleOverrides(row.id);
  return rowToUserRecord(row, overrides);
}

export async function createUser(input: CreateUserInput): Promise<UserRecord | null> {
  const db = getControlPool();
  if (!input.acceptTerms) return null;

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const businessName = input.businessName.trim();
  const normalizedPlan = normalizePlan(input.plan ?? 'starter');
  const passwordHash = hashPassword(input.password);
  const avatarInitials = initialsFromName(name);
  const emailVerificationToken = generateEmailVerificationToken();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userId = await nextSequentialId(db, 'users', 'user');
    const tenantDbName = tenantDbNameFromUserId(userId);

    const user: UserRecord = {
      id: userId,
      name,
      email,
      password: passwordHash,
      emailVerified: false,
      emailVerificationToken,
      termsAcceptedAt: new Date().toISOString(),
      plan: normalizedPlan,
      businessName,
      avatarInitials,
      moduleOverrides: {},
    };

    try {
      await db.query(
        `
          INSERT INTO users (
            id, name, email, password, email_verified, email_verification_token, terms_accepted_at, plan, business_name, avatar_initials, tenant_db_name, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          user.id, user.name, user.email, user.password, user.emailVerified ? 1 : 0, user.emailVerificationToken ?? null,
          user.plan, user.businessName, user.avatarInitials ?? null, tenantDbName,
        ]
      );

      await ensureTenantSchema(tenantDbName);
      return user;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (isUsersEmailDuplicateError(error)) return null;
      if (isPrimaryKeyDuplicateError(error)) continue;
      throw error;
    }
  }

  throw new Error('No se pudo generar un id de usuario unico tras varios intentos.');
}

export async function verifyUserEmailByToken(token: string): Promise<UserRecord | null> {
  const db = getControlPool();
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  const [existingRows] = await db.query<UserRow[]>(
    `SELECT id FROM users WHERE email_verification_token = ? LIMIT 1`,
    [normalizedToken]
  );

  const existing = existingRows[0];
  if (!existing) return null;

  const [result] = await db.query<ResultSetHeader>(
    `UPDATE users SET email_verified = 1, email_verification_token = NULL, updated_at = NOW() WHERE email_verification_token = ? LIMIT 1`,
    [normalizedToken]
  );

  if (!result.affectedRows) return null;

  const user = await findUserById(existing.id);
  return user ?? null;
}

export async function refreshEmailVerificationTokenByEmail(email: string): Promise<string | null> {
  const db = getControlPool();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const [rows] = await db.query<UserRow[]>(
    `SELECT id, email_verified FROM users WHERE email = ? LIMIT 1`,
    [normalizedEmail]
  );

  const row = rows[0];
  if (!row || row.email_verified === 1) return null;

  const nextToken = generateEmailVerificationToken();
  await db.query(
    `UPDATE users SET email_verification_token = ?, updated_at = NOW() WHERE id = ?`,
    [nextToken, row.id]
  );

  return nextToken;
}

export function sanitizeUser(user: UserRecord): UserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    plan: user.plan,
    businessName: user.businessName,
    avatarInitials: user.avatarInitials,
    trialEndDate: user.trialEndDate,
  };
}

export async function getTenantDbNameByUserId(userId: string): Promise<string | null> {
  if (tenantCache.has(userId)) return tenantCache.get(userId)!;

  const db = getControlPool();
  const [rows] = await db.query<TenantRefRow[]>(
    `SELECT id, tenant_db_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  const tenantDbName = String(row.tenant_db_name || '').trim() || tenantDbNameFromUserId(row.id);
  if (!String(row.tenant_db_name || '').trim()) {
    await db.query(`UPDATE users SET tenant_db_name = ? WHERE id = ?`, [tenantDbName, row.id]);
  }

  tenantCache.set(userId, tenantDbName);
  return tenantDbName;
}

export async function getModuleOverrides(userId: string): Promise<Partial<Record<ModuleId, boolean>>> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return {};

  const db = getControlPool();
  const [rows] = await db.query<ModuleOverrideRow[]>(
    `SELECT module_id, enabled FROM ${q(tenantDbName)}.module_overrides`
  );

  const overrides: Partial<Record<ModuleId, boolean>> = {};
  for (const row of rows) {
    overrides[row.module_id as ModuleId] = row.enabled === 1;
  }
  return overrides;
}

export async function setModuleOverride(
  userId: string,
  moduleId: ModuleId,
  enabled: boolean
): Promise<Partial<Record<ModuleId, boolean>>> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return {};

  const db = getControlPool();
  await db.query(
    `
      INSERT INTO ${q(tenantDbName)}.module_overrides (module_id, enabled, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = NOW()
    `,
    [moduleId, enabled ? 1 : 0]
  );

  return getModuleOverrides(userId);
}

export async function clearModuleOverride(
  userId: string,
  moduleId: ModuleId
): Promise<Partial<Record<ModuleId, boolean>>> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return {};

  const db = getControlPool();
  await db.query(`DELETE FROM ${q(tenantDbName)}.module_overrides WHERE module_id = ?`, [moduleId]);

  return getModuleOverrides(userId);
}

export async function setUserPlan(userId: string, plan: PlanId): Promise<UserPublic | null> {
  const db = getControlPool();
  const normalizedPlan = normalizePlan(plan);
  const trialEndDate = normalizedPlan === 'starter' 
    ? null 
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const [result] = await db.query<ResultSetHeader>(
    `UPDATE users SET plan = ?, trial_end_date = ?, updated_at = NOW() WHERE id = ?`,
    [normalizedPlan, trialEndDate, userId]
  );

  if (!result.affectedRows) return null;
  const updated = await findUserById(userId);
  if (!updated) return null;
  return sanitizeUser(updated);
}

function rowToUserRecord(
  row: UserRow,
  moduleOverrides: Partial<Record<ModuleId, boolean>>
): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified === 1,
    emailVerificationToken: row.email_verification_token ?? undefined,
    termsAcceptedAt: row.terms_accepted_at ?? undefined,
    password: row.password,
    plan: normalizePlan(row.plan),
    businessName: row.business_name,
    avatarInitials: row.avatar_initials ?? undefined,
    trialEndDate: row.trial_end_date ?? undefined,
    moduleOverrides,
  };
}
