
import { randomUUID } from 'crypto';
import { compareSync, hashSync } from 'bcryptjs';
import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { ModuleId, PlanId, UserPublic, UserRecord } from '../types';

interface CreateUserInput {
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

interface CountRow extends RowDataPacket {
  total: number;
}

interface IdRow extends RowDataPacket {
  id: string;
}

interface TableExistsRow extends RowDataPacket {
  total: number;
}

interface MaxIdRow extends RowDataPacket {
  max_value: number | string | null;
}

export type AppointmentStatusDb =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

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

interface TenantServiceRow extends RowDataPacket {
  id: string;
  name: string;
  category: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  display_order: number;
  is_active: number;
}

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

export interface ServiceRecord {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  priceCents: number;
  description: string;
  isActive: boolean;
  displayOrder: number;
}

export interface CreateServiceInput {
  name: string;
  category?: string;
  durationMin: number;
  priceCents: number;
  description?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export type UpdateServiceInput = Partial<CreateServiceInput>;

const SALT_ROUNDS = 10;

let controlPool: Pool | null = null;
let initializingPromise: Promise<void> | null = null;

export async function initializeStore(): Promise<void> {
  if (controlPool) return;
  if (initializingPromise) {
    await initializingPromise;
    return;
  }

  initializingPromise = (async () => {
    await ensureControlDatabaseAndPool();
    await ensureControlSchema();
    await backfillTenantDbNames();
    await ensureAllTenantSchemas();
    await migrateLegacySharedTablesToTenantDbs();
    await ensureDemoUserIfNeeded();
    await ensureAllTenantSchemas();
  })();

  try {
    await initializingPromise;
  } finally {
    initializingPromise = null;
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const db = getControlPool();
  const [rows] = await db.query<UserRow[]>(
    `
      SELECT
        id,
        name,
        email,
        password,
        email_verified,
        email_verification_token,
        terms_accepted_at,
        plan,
        business_name,
        avatar_initials,
        tenant_db_name
      FROM users
      WHERE email = ?
      LIMIT 1
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
      SELECT
        id,
        name,
        email,
        password,
        email_verified,
        email_verification_token,
        terms_accepted_at,
        plan,
        business_name,
        avatar_initials,
        tenant_db_name
      FROM users
      WHERE id = ?
      LIMIT 1
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

  if (!input.acceptTerms) {
    return null;
  }

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
            id,
            name,
            email,
            password,
            email_verified,
            email_verification_token,
            terms_accepted_at,
            plan,
            business_name,
            avatar_initials,
            tenant_db_name,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())
        `,
        [
          user.id,
          user.name,
          user.email,
          user.password,
          user.emailVerified ? 1 : 0,
          user.emailVerificationToken ?? null,
          user.plan,
          user.businessName,
          user.avatarInitials ?? null,
          tenantDbName,
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
    `
      SELECT
        id,
        name,
        email,
        password,
        email_verified,
        email_verification_token,
        terms_accepted_at,
        plan,
        business_name,
        avatar_initials,
        tenant_db_name
      FROM users
      WHERE email_verification_token = ?
      LIMIT 1
    `,
    [normalizedToken]
  );

  const existing = existingRows[0];
  if (!existing) return null;

  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE users
      SET email_verified = 1,
          email_verification_token = NULL,
          updated_at = NOW()
      WHERE email_verification_token = ?
      LIMIT 1
    `,
    [normalizedToken]
  );

  if (!result.affectedRows) return null;

  const row = await findUserById(existing.id);
  if (!row) return null;
  return row;
}

export async function refreshEmailVerificationTokenByEmail(email: string): Promise<string | null> {
  const db = getControlPool();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const [rows] = await db.query<UserRow[]>(
    `
      SELECT
        id,
        name,
        email,
        password,
        email_verified,
        email_verification_token,
        terms_accepted_at,
        plan,
        business_name,
        avatar_initials,
        tenant_db_name
      FROM users
      WHERE email = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const row = rows[0];
  if (!row || row.email_verified === 1) return null;

  const nextToken = generateEmailVerificationToken();
  await db.query(
    `
      UPDATE users
      SET email_verification_token = ?,
          updated_at = NOW()
      WHERE id = ?
    `,
    [nextToken, row.id]
  );

  return nextToken;
}
export function verifyPassword(user: UserRecord, password: string): boolean {
  if (isPasswordHash(user.password)) {
    return compareSync(password, user.password);
  }

  return user.password === password;
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
  };
}

export async function getModuleOverrides(userId: string): Promise<Partial<Record<ModuleId, boolean>>> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return {};

  const db = getControlPool();
  const [rows] = await db.query<ModuleOverrideRow[]>(
    `
      SELECT module_id, enabled
      FROM ${q(tenantDbName)}.module_overrides
    `
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
  await db.query(
    `
      DELETE FROM ${q(tenantDbName)}.module_overrides
      WHERE module_id = ?
    `,
    [moduleId]
  );

  return getModuleOverrides(userId);
}

export async function setUserPlan(userId: string, plan: PlanId): Promise<UserPublic | null> {
  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE users
      SET plan = ?, updated_at = NOW()
      WHERE id = ?
    `,
    [normalizePlan(plan), userId]
  );

  if (!result.affectedRows) return null;

  const updated = await findUserById(userId);
  if (!updated) return null;
  return sanitizeUser(updated);
}

export async function listServices(userId: string): Promise<ServiceRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<TenantServiceRow[]>(
    `
      SELECT id, name, category, description, duration_minutes, price_cents, display_order, is_active
      FROM ${q(tenantDbName)}.services
      ORDER BY display_order ASC, name ASC
    `
  );

  return rows.map(toServiceRecord);
}

export async function createService(
  userId: string,
  input: CreateServiceInput
): Promise<ServiceRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const db = getControlPool();
  const normalized = normalizeCreateServiceInput(input);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const displayOrder =
      normalized.displayOrder === undefined
        ? await getNextServiceDisplayOrder(connection, tenantDbName)
        : normalized.displayOrder;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const serviceId = `svc_${randomUUID()}`;

      try {
        await connection.query(
          `
            INSERT INTO ${q(tenantDbName)}.services (
              id, name, category, description, duration_minutes, price_cents, display_order, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            serviceId,
            normalized.name,
            normalized.category,
            normalized.description || null,
            normalized.durationMin,
            normalized.priceCents,
            displayOrder,
            normalized.isActive ? 1 : 0,
          ]
        );

        await connection.commit();
        return getServiceById(tenantDbName, serviceId);
      } catch (error) {
        if (isDuplicateKeyError(error) && isPrimaryKeyDuplicateError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('No se pudo generar un id de servicio unico tras varios intentos.');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateService(
  userId: string,
  serviceId: string,
  input: UpdateServiceInput
): Promise<ServiceRecord | null> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return null;

  const current = await getServiceById(tenantDbName, serviceId);
  if (!current) return null;

  const normalized = normalizeUpdateServiceInput(input, current);
  const db = getControlPool();

  const [result] = await db.query<ResultSetHeader>(
    `
      UPDATE ${q(tenantDbName)}.services
      SET name = ?,
          category = ?,
          description = ?,
          duration_minutes = ?,
          price_cents = ?,
          display_order = ?,
          is_active = ?,
          updated_at = NOW()
      WHERE id = ?
    `,
    [
      normalized.name,
      normalized.category,
      normalized.description || null,
      normalized.durationMin,
      normalized.priceCents,
      normalized.displayOrder,
      normalized.isActive ? 1 : 0,
      serviceId,
    ]
  );

  if (!result.affectedRows) return null;
  return getServiceById(tenantDbName, serviceId);
}

export async function deleteService(userId: string, serviceId: string): Promise<boolean> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return false;

  const db = getControlPool();
  const [result] = await db.query<ResultSetHeader>(
    `
      DELETE FROM ${q(tenantDbName)}.services
      WHERE id = ?
    `,
    [serviceId]
  );

  return result.affectedRows > 0;
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
        a.id,
        a.status,
        DATE_FORMAT(a.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
        a.notes,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        s.name AS service_name,
        s.duration_minutes AS service_duration_minutes,
        s.price_cents AS service_price_cents
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      INNER JOIN ${q(tenantDbName)}.services s ON s.id = a.service_id
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

    const customerId = await ensureCustomer(
      connection,
      tenantDbName,
      normalized.customerName,
      normalized.customerPhone ?? ''
    );
    const serviceId = await ensureService(
      connection,
      tenantDbName,
      normalized.serviceName,
      normalized.durationMin,
      normalized.priceCents
    );

    const appointmentId = `apt_${randomUUID()}`;
    const startAt = composeMySqlDateTime(normalized.date, normalized.time);
    const endAt = addMinutesToMySqlDateTime(startAt, normalized.durationMin);

    await connection.query(
      `
        INSERT INTO ${q(tenantDbName)}.appointments (
          id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at
        )
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        appointmentId,
        customerId,
        serviceId,
        `${normalized.serviceName} - ${normalized.customerName}`,
        normalized.status,
        startAt,
        endAt,
        normalized.notes || null,
      ]
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

    const customerId = await ensureCustomer(
      connection,
      tenantDbName,
      merged.customerName,
      merged.customerPhone ?? ''
    );
    const serviceId = await ensureService(
      connection,
      tenantDbName,
      merged.serviceName,
      merged.durationMin,
      merged.priceCents
    );

    const startAt = composeMySqlDateTime(merged.date, merged.time);
    const endAt = addMinutesToMySqlDateTime(startAt, merged.durationMin);

    const [result] = await connection.query<ResultSetHeader>(
      `
        UPDATE ${q(tenantDbName)}.appointments
        SET customer_id = ?,
            service_id = ?,
            title = ?,
            status = ?,
            start_at = ?,
            end_at = ?,
            notes = ?,
            updated_at = NOW()
        WHERE id = ?
      `,
      [
        customerId,
        serviceId,
        `${merged.serviceName} - ${merged.customerName}`,
        merged.status,
        startAt,
        endAt,
        merged.notes || null,
        appointmentId,
      ]
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
        a.id,
        a.status,
        DATE_FORMAT(a.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
        a.notes,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        s.name AS service_name,
        s.duration_minutes AS service_duration_minutes,
        s.price_cents AS service_price_cents
      FROM ${q(tenantDbName)}.appointments a
      INNER JOIN ${q(tenantDbName)}.customers c ON c.id = a.customer_id
      INNER JOIN ${q(tenantDbName)}.services s ON s.id = a.service_id
      WHERE a.id = ?
      LIMIT 1
    `,
    [appointmentId]
  );

  const row = rows[0];
  if (!row) return null;
  return toAppointmentRecord(row);
}

async function getServiceById(
  tenantDbName: string,
  serviceId: string
): Promise<ServiceRecord | null> {
  const db = getControlPool();
  const [rows] = await db.query<TenantServiceRow[]>(
    `
      SELECT id, name, category, description, duration_minutes, price_cents, display_order, is_active
      FROM ${q(tenantDbName)}.services
      WHERE id = ?
      LIMIT 1
    `,
    [serviceId]
  );

  const row = rows[0];
  if (!row) return null;
  return toServiceRecord(row);
}

async function getNextServiceDisplayOrder(
  connection: PoolConnection,
  tenantDbName: string
): Promise<number> {
  const [rows] = await connection.query<MaxIdRow[]>(
    `
      SELECT COALESCE(MAX(display_order), 0) AS max_value
      FROM ${q(tenantDbName)}.services
    `
  );

  const maxValue = Number(rows[0]?.max_value ?? 0);
  return Number.isFinite(maxValue) ? maxValue + 1 : 1;
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
    `
      SELECT id
      FROM ${q(tenantDbName)}.customers
      WHERE full_name = ?
        AND ((phone IS NULL AND ? = '') OR phone = ?)
      LIMIT 1
    `,
    [normalizedName, normalizedPhone, normalizedPhone]
  );

  if (rows[0]?.id) return rows[0].id;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const customerId = await nextSequentialId(
      connection,
      `${q(tenantDbName)}.customers`,
      'cliente'
    );

    try {
      await connection.query(
        `
          INSERT INTO ${q(tenantDbName)}.customers (id, full_name, phone, created_at, updated_at)
          VALUES (?, ?, ?, NOW(), NOW())
        `,
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
    `
      SELECT id
      FROM ${q(tenantDbName)}.services
      WHERE name = ?
      LIMIT 1
    `,
    [normalizedName]
  );

  if (rows[0]?.id) {
    await connection.query(
      `
        UPDATE ${q(tenantDbName)}.services
        SET duration_minutes = ?,
            price_cents = ?,
            is_active = 1,
            updated_at = NOW()
        WHERE id = ?
      `,
      [durationMin, priceCents, rows[0].id]
    );

    return rows[0].id;
  }

  const serviceId = `svc_${randomUUID()}`;
  await connection.query(
    `
      INSERT INTO ${q(tenantDbName)}.services (
        id, name, duration_minutes, price_cents, is_active, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, NOW(), NOW())
    `,
    [serviceId, normalizedName, durationMin, priceCents]
  );

  return serviceId;
}

function getControlPool(): Pool {
  if (!controlPool) {
    throw new Error('Store no inicializado. Llama initializeStore() antes de usar la capa de datos.');
  }
  return controlPool;
}

async function ensureControlDatabaseAndPool(): Promise<void> {
  const adminPool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    waitForConnections: true,
    connectionLimit: Math.max(1, env.mysqlConnectionLimit),
    queueLimit: 0,
  });

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS ${q(env.mysqlDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await adminPool.end();
  }

  controlPool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: Math.max(1, env.mysqlConnectionLimit),
    queueLimit: 0,
    dateStrings: true,
  });
}
async function ensureControlSchema(): Promise<void> {
  const db = getControlPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      email_verification_token VARCHAR(128) NULL,
      terms_accepted_at DATETIME NULL,
      plan ENUM('starter','pro','enterprise') NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      avatar_initials VARCHAR(16) NULL,
      tenant_db_name VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  try {
    await db.query(`ALTER TABLE users ADD COLUMN tenant_db_name VARCHAR(128) NULL`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  try {
    await db.query(`ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  try {
    await db.query(`ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(128) NULL`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  try {
    await db.query(`ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
      throw error;
    }
  }

  try {
    await db.query(`CREATE UNIQUE INDEX idx_users_email_verification_token ON users (email_verification_token)`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }

  // onboarding_completed column
  try {
    await db.query(`ALTER TABLE users ADD COLUMN onboarding_completed TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') throw error;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS module_overrides (
      user_id VARCHAR(64) NOT NULL,
      module_id VARCHAR(64) NOT NULL,
      enabled TINYINT(1) NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, module_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(64) NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_user_name (user_id, full_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      duration_minutes INT NOT NULL,
      price_cents INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_services_user_name (user_id, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(64) NULL,
      role VARCHAR(64) NOT NULL DEFAULT 'staff',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_staff_user_name (user_id, full_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      customer_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NOT NULL,
      staff_id VARCHAR(64) NULL,
      title VARCHAR(255) NOT NULL,
      status ENUM('scheduled','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_appointments_user_start (user_id, start_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function backfillTenantDbNames(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<TenantRefRow[]>(
    `
      SELECT id, tenant_db_name
      FROM users
    `
  );

  for (const row of rows) {
    const current = String(row.tenant_db_name || '').trim();
    if (current) continue;

    const tenantDbName = tenantDbNameFromUserId(row.id);
    await db.query(
      `
        UPDATE users
        SET tenant_db_name = ?
        WHERE id = ?
      `,
      [tenantDbName, row.id]
    );
  }
}

async function ensureDemoUserIfNeeded(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<CountRow[]>(`SELECT COUNT(*) AS total FROM users`);
  const total = Number(rows[0]?.total ?? 0);
  if (total > 0) return;

  const demoId = 'usr_demo_001';
  const demoTenantDbName = tenantDbNameFromUserId(demoId);

  await db.query(
    `
      INSERT INTO users (
        id,
        name,
        email,
        password,
        email_verified,
        email_verification_token,
        terms_accepted_at,
        plan,
        business_name,
        avatar_initials,
        tenant_db_name,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 1, NULL, NOW(), ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      demoId,
      'Daniel Hernandez',
      'demo@agendapro.com',
      hashPassword('demo123'),
      'pro',
      'Mi Negocio',
      'DH',
      demoTenantDbName,
    ]
  );

  await ensureTenantSchema(demoTenantDbName);
}

async function ensureAllTenantSchemas(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<TenantRefRow[]>(
    `
      SELECT id, tenant_db_name
      FROM users
    `
  );

  for (const row of rows) {
    const tenantDbName = String(row.tenant_db_name || '').trim() || tenantDbNameFromUserId(row.id);
    if (!String(row.tenant_db_name || '').trim()) {
      await db.query(`UPDATE users SET tenant_db_name = ? WHERE id = ?`, [tenantDbName, row.id]);
    }
    await ensureTenantSchema(tenantDbName);
  }
}
async function ensureTenantSchema(tenantDbName: string): Promise<void> {
  const adminPool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    waitForConnections: true,
    connectionLimit: Math.max(1, env.mysqlConnectionLimit),
    queueLimit: 0,
  });

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS ${q(tenantDbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    await adminPool.query(`
      CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.module_overrides (
        module_id VARCHAR(64) PRIMARY KEY,
        enabled TINYINT(1) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await adminPool.query(`
      CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.customers (
        id VARCHAR(64) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(64) NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customers_name (full_name),
        UNIQUE KEY uniq_customers_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await adminPool.query(`
      CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.services (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(64) NOT NULL DEFAULT 'general',
        description TEXT NULL,
        duration_minutes INT NOT NULL,
        price_cents INT NOT NULL DEFAULT 0,
        display_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_services_name (name),
        INDEX idx_services_order (display_order),
        INDEX idx_services_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await adminPool.query(
        `ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN category VARCHAR(64) NOT NULL DEFAULT 'general'`
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    try {
      await adminPool.query(
        `ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN description TEXT NULL`
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    try {
      await adminPool.query(
        `ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN display_order INT NOT NULL DEFAULT 0`
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') {
        throw error;
      }
    }

    try {
      await adminPool.query(`CREATE INDEX idx_services_order ON ${q(tenantDbName)}.services (display_order)`);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ER_DUP_KEYNAME') {
        throw error;
      }
    }

    await adminPool.query(`
      CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.staff (
        id VARCHAR(64) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(64) NULL,
        role VARCHAR(64) NOT NULL DEFAULT 'staff',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_staff_email (email),
        INDEX idx_staff_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await adminPool.query(`
      CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.appointments (
        id VARCHAR(64) PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL,
        service_id VARCHAR(64) NOT NULL,
        staff_id VARCHAR(64) NULL,
        title VARCHAR(255) NOT NULL,
        status ENUM('scheduled','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
        start_at DATETIME NOT NULL,
        end_at DATETIME NOT NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_appointments_start (start_at),
        INDEX idx_appointments_status (status),
        CONSTRAINT fk_appointments_customer
          FOREIGN KEY (customer_id) REFERENCES ${q(tenantDbName)}.customers(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_appointments_service
          FOREIGN KEY (service_id) REFERENCES ${q(tenantDbName)}.services(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_appointments_staff
          FOREIGN KEY (staff_id) REFERENCES ${q(tenantDbName)}.staff(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // business_settings table
    await adminPool.query(`
  CREATE TABLE IF NOT EXISTS ${q(tenantDbName)}.business_settings (
    id         INT PRIMARY KEY DEFAULT 1,
    business_type VARCHAR(64) NOT NULL DEFAULT '',
    phone      VARCHAR(64)  NOT NULL DEFAULT '',
    address    VARCHAR(255) NOT NULL DEFAULT '',
    logo_url   VARCHAR(512) NOT NULL DEFAULT '',
    schedules  JSON         NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`);

    // specialties column in staff
    try {
      await adminPool.query(
        `ALTER TABLE ${q(tenantDbName)}.staff ADD COLUMN specialties JSON NOT NULL DEFAULT (JSON_ARRAY())`
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  } finally {
    await adminPool.end();
  }
}

async function migrateLegacySharedTablesToTenantDbs(): Promise<void> {
  const hasLegacyAppointments = await controlTableExists('appointments');
  if (!hasLegacyAppointments) return;

  const db = getControlPool();
  const [users] = await db.query<TenantRefRow[]>(
    `
      SELECT id, tenant_db_name
      FROM users
    `
  );

  for (const user of users) {
    const tenantDbName = String(user.tenant_db_name || '').trim();
    if (!tenantDbName) continue;

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.module_overrides (module_id, enabled, updated_at)
        SELECT module_id, enabled, updated_at
        FROM module_overrides
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE
          enabled = VALUES(enabled),
          updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.customers (id, full_name, email, phone, notes, created_at, updated_at)
        SELECT id, full_name, email, phone, notes, created_at, updated_at
        FROM customers
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          email = VALUES(email),
          phone = VALUES(phone),
          notes = VALUES(notes),
          updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.services (
          id,
          name,
          category,
          description,
          duration_minutes,
          price_cents,
          display_order,
          is_active,
          created_at,
          updated_at
        )
        SELECT
          id,
          name,
          'general' AS category,
          '' AS description,
          duration_minutes,
          price_cents,
          0 AS display_order,
          is_active,
          created_at,
          updated_at
        FROM services
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          category = VALUES(category),
          description = VALUES(description),
          duration_minutes = VALUES(duration_minutes),
          price_cents = VALUES(price_cents),
          display_order = VALUES(display_order),
          is_active = VALUES(is_active),
          updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.staff (id, full_name, email, phone, role, is_active, created_at, updated_at)
        SELECT id, full_name, email, phone, role, is_active, created_at, updated_at
        FROM staff
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          email = VALUES(email),
          phone = VALUES(phone),
          role = VALUES(role),
          is_active = VALUES(is_active),
          updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.appointments (
          id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at
        )
        SELECT id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at
        FROM appointments
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE
          customer_id = VALUES(customer_id),
          service_id = VALUES(service_id),
          staff_id = VALUES(staff_id),
          title = VALUES(title),
          status = VALUES(status),
          start_at = VALUES(start_at),
          end_at = VALUES(end_at),
          notes = VALUES(notes),
          updated_at = VALUES(updated_at)
      `,
      [user.id]
    );
  }
}

async function controlTableExists(tableName: string): Promise<boolean> {
  const db = getControlPool();
  const [rows] = await db.query<TableExistsRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
    `,
    [env.mysqlDatabase, tableName]
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function getTenantDbNameByUserId(userId: string): Promise<string | null> {
  const db = getControlPool();
  const [rows] = await db.query<TenantRefRow[]>(
    `
      SELECT id, tenant_db_name
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const row = rows[0];
  if (!row) return null;

  const tenantDbName = String(row.tenant_db_name || '').trim() || tenantDbNameFromUserId(row.id);
  if (!String(row.tenant_db_name || '').trim()) {
    await db.query(`UPDATE users SET tenant_db_name = ? WHERE id = ?`, [tenantDbName, row.id]);
  }

  return tenantDbName;
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
    moduleOverrides,
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

function toServiceRecord(row: TenantServiceRow): ServiceRecord {
  return {
    id: row.id,
    name: row.name,
    category: String(row.category || 'general').trim() || 'general',
    durationMin: Number(row.duration_minutes || 0),
    priceCents: Number(row.price_cents || 0),
    description: row.description ?? '',
    isActive: row.is_active === 1,
    displayOrder: Number(row.display_order || 0),
  };
}

function composeMySqlDateTime(date: string, time: string): string {
  return `${date} ${time}:00`;
}

function splitMySqlDateTime(value: string): { date: string; time: string } {
  const normalized = value.includes('T') ? value.replace('T', ' ') : value;
  const [datePart = '', timePart = '00:00:00'] = normalized.split(' ');

  return {
    date: datePart,
    time: timePart.slice(0, 5),
  };
}

function addMinutesToMySqlDateTime(startAt: string, minutes: number): string {
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

function normalizeCreateServiceInput(input: CreateServiceInput): CreateServiceInput {
  const displayOrderRaw =
    input.displayOrder === undefined || input.displayOrder === null
      ? undefined
      : Number(input.displayOrder);

  return {
    name: String(input.name || '').trim(),
    category: normalizeServiceCategory(input.category),
    durationMin: Math.max(1, Math.floor(Number(input.durationMin || 0))),
    priceCents: Math.max(0, Math.round(Number(input.priceCents || 0))),
    description: String(input.description || '').trim(),
    isActive: input.isActive ?? true,
    displayOrder:
      displayOrderRaw === undefined || !Number.isFinite(displayOrderRaw)
        ? undefined
        : Math.max(0, Math.floor(displayOrderRaw)),
  };
}

function normalizeUpdateServiceInput(input: UpdateServiceInput, current: ServiceRecord): CreateServiceInput {
  return normalizeCreateServiceInput({
    name: input.name ?? current.name,
    category: input.category ?? current.category,
    durationMin: input.durationMin ?? current.durationMin,
    priceCents: input.priceCents ?? current.priceCents,
    description: input.description ?? current.description,
    isActive: input.isActive ?? current.isActive,
    displayOrder: input.displayOrder ?? current.displayOrder,
  });
}

function normalizePlan(value: unknown): PlanId {
  if (value === 'starter' || value === 'pro' || value === 'enterprise') return value;
  return 'starter';
}

function normalizeAppointmentStatus(value: unknown): AppointmentStatusDb {
  if (
    value === 'scheduled' ||
    value === 'confirmed' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'no_show'
  ) {
    return value;
  }

  return 'scheduled';
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function normalizeServiceCategory(value: unknown): string {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

  return raw || 'general';
}

function tenantDbNameFromUserId(userId: string): string {
  const safeId = String(userId || '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  return `${env.mysqlTenantDbPrefix}${safeId}`;
}

function initialsFromName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function isPasswordHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

function hashPassword(password: string): string {
  if (env.storePlaintextPasswords) {
    return password;
  }

  return hashSync(password, SALT_ROUNDS);
}

function generateEmailVerificationToken(): string {
  return randomUUID().replace(/-/g, '');
}

function q(identifier: string): string {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ER_DUP_ENTRY';
}

function isPrimaryKeyDuplicateError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) return false;

  const detail = String(
    (error as { sqlMessage?: string; message?: string })?.sqlMessage ??
    (error as { message?: string })?.message ??
    ''
  );

  return detail.toLowerCase().includes("for key 'primary'");
}

function isUsersEmailDuplicateError(error: unknown): boolean {
  if (!isDuplicateKeyError(error)) return false;

  const detail = String(
    (error as { sqlMessage?: string; message?: string })?.sqlMessage ??
    (error as { message?: string })?.message ??
    ''
  ).toLowerCase();

  return detail.includes("for key 'email'") || detail.includes("for key 'users.email'");
}

async function nextSequentialId(
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

function escapeRegexForMySql(value: string): string {
  return String(value).replace(/[\\.^$*+?()[\]{}|]/g, '\\$&');
}

// ── Onboarding & Business Settings ────────────────────────

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
  await db.query(
    `UPDATE users SET onboarding_completed = 1, updated_at = NOW() WHERE id = ?`,
    [userId]
  );
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
  try { schedules = JSON.parse(row.schedules || '[]'); } catch { schedules = []; }

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

  const current = await getBusinessSettings(userId) ?? {
    businessType: '', phone: '', address: '', logoUrl: '', schedules: [],
  };

  const next = {
    businessType: input.businessType ?? current.businessType,
    phone: input.phone ?? current.phone,
    address: input.address ?? current.address,
    logoUrl: input.logoUrl ?? current.logoUrl,
    schedules: input.schedules ?? current.schedules,
  };

  await db.query(
    `INSERT INTO ${q(tenantDbName)}.business_settings
       (id, business_type, phone, address, logo_url, schedules, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       business_type = VALUES(business_type),
       phone         = VALUES(phone),
       address       = VALUES(address),
       logo_url      = VALUES(logo_url),
       schedules     = VALUES(schedules),
       updated_at    = NOW()`,
    [next.businessType, next.phone, next.address, next.logoUrl, JSON.stringify(next.schedules)]
  );

  return getBusinessSettings(userId);
}

export async function listStaff(userId: string): Promise<StaffRecord[]> {
  const tenantDbName = await getTenantDbNameByUserId(userId);
  if (!tenantDbName) return [];

  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT id, full_name, email, phone, role, specialties, is_active
     FROM ${q(tenantDbName)}.staff
     ORDER BY full_name ASC`
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
    `INSERT INTO ${q(tenantDbName)}.staff
       (id, full_name, email, phone, role, specialties, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
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
    `SELECT id, full_name, email, phone, role, specialties, is_active
     FROM ${q(tenantDbName)}.staff WHERE id = ? LIMIT 1`,
    [staffId]
  );

  return rows[0] ? rowToStaffRecord(rows[0] as RowDataPacket) : null;
}

function rowToStaffRecord(row: RowDataPacket): StaffRecord {
  let specialties: string[] = [];
  try { specialties = JSON.parse(row.specialties || '[]'); } catch { specialties = []; }

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
