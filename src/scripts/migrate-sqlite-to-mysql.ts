import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
import mysql, { PoolConnection } from 'mysql2/promise';
import { env } from '../config/env';
import { initializeStore } from '../data/schema';
import { PlanId } from '../types';

interface SqliteControlUserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  plan: string;
  business_name: string;
  avatar_initials: string | null;
  tenant_db_path: string | null;
}

interface SqliteModuleOverrideRow {
  module_id: string;
  enabled: number;
}

interface SqliteCustomerRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface SqliteServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  is_active: number;
  created_at: string | null;
  updated_at: string | null;
}

interface SqliteStaffRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_active: number;
  created_at: string | null;
  updated_at: string | null;
}

interface SqliteAppointmentRow {
  id: string;
  customer_id: string;
  service_id: string;
  staff_id: string | null;
  title: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

async function main(): Promise<void> {
  let DatabaseSyncCtor: (new (path: string) => any) | null;
  try {
    DatabaseSyncCtor = require('node:sqlite').DatabaseSync as new (path: string) => any;
  } catch {
    console.error('node:sqlite no disponible en esta version de Node.');
    process.exit(1);
    return;
  }

  await initializeStore();

  const sqliteControlDbPath = resolvePath(
    env.sqliteControlDbPath,
    join(process.cwd(), 'storage', 'control.db'),
  );

  if (!existsSync(sqliteControlDbPath)) {
    console.error(`No existe SQLite control DB en: ${sqliteControlDbPath}`);
    process.exit(1);
    return;
  }

  const sqliteControlDb = new DatabaseSyncCtor(sqliteControlDbPath);

  const mysqlPool = mysql.createPool({
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

  const users = sqliteControlDb
    .prepare(
      `
        SELECT id, name, email, password, plan, business_name, avatar_initials, tenant_db_path
        FROM users
      `,
    )
    .all() as SqliteControlUserRow[];

  if (!Array.isArray(users) || users.length === 0) {
    console.log('No se encontraron usuarios en SQLite para migrar.');
    sqliteControlDb.close();
    await mysqlPool.end();
    return;
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    for (const row of users) {
      const normalizedUser = normalizeUser(row);
      await upsertUser(connection, normalizedUser);

      const tenantPath = resolveTenantPath(row.tenant_db_path, normalizedUser.id);
      if (!tenantPath || !existsSync(tenantPath)) continue;

      const tenantDb = new DatabaseSyncCtor(tenantPath);
      try {
        await migrateTenant(connection, tenantDb, normalizedUser.id);
      } finally {
        tenantDb.close();
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    sqliteControlDb.close();
    await mysqlPool.end();
  }

  console.log(`Migracion completada. Usuarios migrados: ${users.length}`);
}
async function migrateTenant(
  connection: PoolConnection,
  tenantDb: any,
  userId: string,
): Promise<void> {
  const moduleOverrides = tenantDb
    .prepare('SELECT module_id, enabled FROM module_overrides')
    .all() as SqliteModuleOverrideRow[];

  for (const row of moduleOverrides) {
    if (!row?.module_id) continue;
    await connection.query(
      `
        INSERT INTO module_overrides (user_id, module_id, enabled, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = NOW()
      `,
      [userId, row.module_id, row.enabled === 1 ? 1 : 0],
    );
  }

  const customers = tenantDb
    .prepare('SELECT id, full_name, email, phone, notes, created_at, updated_at FROM customers')
    .all() as SqliteCustomerRow[];

  for (const row of customers) {
    if (!row?.id || !row?.full_name) continue;
    await connection.query(
      `
        INSERT INTO customers (id, user_id, full_name, email, phone, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          email = VALUES(email),
          phone = VALUES(phone),
          notes = VALUES(notes),
          updated_at = VALUES(updated_at)
      `,
      [
        row.id,
        userId,
        row.full_name,
        normalizeNullable(row.email),
        normalizeNullable(row.phone),
        normalizeNullable(row.notes),
        normalizeDateTime(row.created_at),
        normalizeDateTime(row.updated_at),
      ],
    );
  }

  const services = tenantDb
    .prepare(
      'SELECT id, name, duration_minutes, price_cents, is_active, created_at, updated_at FROM services',
    )
    .all() as SqliteServiceRow[];

  for (const row of services) {
    if (!row?.id || !row?.name) continue;
    await connection.query(
      `
        INSERT INTO services (id, user_id, name, duration_minutes, price_cents, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          duration_minutes = VALUES(duration_minutes),
          price_cents = VALUES(price_cents),
          is_active = VALUES(is_active),
          updated_at = VALUES(updated_at)
      `,
      [
        row.id,
        userId,
        row.name,
        Math.max(1, Number(row.duration_minutes || 0)),
        Math.max(0, Number(row.price_cents || 0)),
        row.is_active === 0 ? 0 : 1,
        normalizeDateTime(row.created_at),
        normalizeDateTime(row.updated_at),
      ],
    );
  }

  const staff = tenantDb
    .prepare(
      'SELECT id, full_name, email, phone, role, is_active, created_at, updated_at FROM staff',
    )
    .all() as SqliteStaffRow[];

  for (const row of staff) {
    if (!row?.id || !row?.full_name) continue;
    await connection.query(
      `
        INSERT INTO staff (id, user_id, full_name, email, phone, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          email = VALUES(email),
          phone = VALUES(phone),
          role = VALUES(role),
          is_active = VALUES(is_active),
          updated_at = VALUES(updated_at)
      `,
      [
        row.id,
        userId,
        row.full_name,
        normalizeNullable(row.email),
        normalizeNullable(row.phone),
        normalizeNullable(row.role) ?? 'staff',
        row.is_active === 0 ? 0 : 1,
        normalizeDateTime(row.created_at),
        normalizeDateTime(row.updated_at),
      ],
    );
  }

  const appointments = tenantDb
    .prepare(
      'SELECT id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at FROM appointments',
    )
    .all() as SqliteAppointmentRow[];

  for (const row of appointments) {
    if (!row?.id || !row?.customer_id || !row?.service_id || !row?.start_at || !row?.end_at) {
      continue;
    }

    await connection.query(
      `
        INSERT INTO appointments (id, user_id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      [
        row.id,
        userId,
        row.customer_id,
        row.service_id,
        normalizeNullable(row.staff_id),
        normalizeNullable(row.title) ?? 'Cita',
        normalizeStatus(row.status),
        normalizeDateTime(row.start_at),
        normalizeDateTime(row.end_at),
        normalizeNullable(row.notes),
        normalizeDateTime(row.created_at),
        normalizeDateTime(row.updated_at),
      ],
    );
  }
}

async function upsertUser(
  connection: PoolConnection,
  user: {
    id: string;
    name: string;
    email: string;
    password: string;
    plan: PlanId;
    businessName: string;
    avatarInitials: string | null;
  },
): Promise<void> {
  await connection.query(
    `
      INSERT INTO users (id, name, email, password, plan, business_name, avatar_initials, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        id = VALUES(id),
        name = VALUES(name),
        password = VALUES(password),
        plan = VALUES(plan),
        business_name = VALUES(business_name),
        avatar_initials = VALUES(avatar_initials),
        updated_at = NOW()
    `,
    [
      user.id,
      user.name,
      user.email,
      user.password,
      user.plan,
      user.businessName,
      user.avatarInitials,
    ],
  );
}

function normalizeUser(row: SqliteControlUserRow): {
  id: string;
  name: string;
  email: string;
  password: string;
  plan: PlanId;
  businessName: string;
  avatarInitials: string | null;
} {
  const email = String(row.email || '')
    .trim()
    .toLowerCase();
  const name = String(row.name || '').trim() || 'Usuario';

  return {
    id: String(row.id || '').trim(),
    name,
    email,
    password: String(row.password || '').trim(),
    plan: toPlan(row.plan),
    businessName: String(row.business_name || '').trim() || 'Mi Negocio',
    avatarInitials: normalizeNullable(row.avatar_initials),
  };
}

function toPlan(value: string): PlanId {
  return value === 'pro' || value === 'enterprise' ? value : 'starter';
}

function normalizeStatus(value: string): string {
  if (
    value === 'confirmed' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'no_show'
  ) {
    return value;
  }
  return 'scheduled';
}

function normalizeDateTime(value: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return nowDateTime();
  const normalized = raw.replace('T', ' ').slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(normalized)) return nowDateTime();
  return normalized;
}

function normalizeNullable(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function resolvePath(rawPath: string, fallbackPath: string): string {
  const candidate = rawPath.trim() || fallbackPath;
  if (isAbsolute(candidate)) return candidate;
  return join(process.cwd(), candidate);
}

function resolveTenantPath(rawPath: string | null, userId: string): string | null {
  if (rawPath && String(rawPath).trim()) {
    const candidate = String(rawPath).trim();
    if (isAbsolute(candidate)) return candidate;
    return join(process.cwd(), candidate);
  }

  const tenantsDir = resolvePath(env.sqliteTenantsDbDir, join(process.cwd(), 'storage', 'tenants'));
  return join(tenantsDir, `${userId}.db`);
}

function nowDateTime(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  const ss = `${d.getSeconds()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

void main().catch((error) => {
  console.error('Error en migracion SQLite -> MySQL');
  console.error(error);
  process.exit(1);
});
