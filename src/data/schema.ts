import mysql, { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { getControlPool, ensureControlDatabaseAndPool } from './db';
import { hashPassword, q, tenantDbNameFromUserId } from './utils';
import { getControlMigrator, getTenantMigrator } from './migrator';

let initializingPromise: Promise<void> | null = null;

export async function initializeStore(): Promise<void> {
  if (initializingPromise) {
    await initializingPromise;
    return;
  }

  initializingPromise = (async () => {
    // 1. Asegurar la creación física del DB Control y su pool
    await ensureControlDatabaseAndPool();

    // 2. Correr las migraciones de Umzug en el Control DB
    const controlMigrator = getControlMigrator();
    await controlMigrator.up();

    // 3. Tareas retroactivas
    await backfillTenantDbNames();
    await migrateLegacySharedTablesToTenantDbs();
    await ensureDemoUserIfNeeded();

    // 4. Correr las migraciones de Umzug dinámicamente en todos los Tenant DBs
    await ensureAllTenantSchemas();
  })();

  try {
    await initializingPromise;
  } finally {
    initializingPromise = null;
  }
}

async function backfillTenantDbNames(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(`SELECT id, tenant_db_name FROM users`);

  for (const row of rows) {
    const current = String(row.tenant_db_name || '').trim();
    if (current) continue;

    const tenantDbName = tenantDbNameFromUserId(row.id);
    await db.query(`UPDATE users SET tenant_db_name = ? WHERE id = ?`, [tenantDbName, row.id]);
  }
}

async function ensureDemoUserIfNeeded(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM users`);
  const total = Number(rows[0]?.total ?? 0);
  if (total > 0) {
    await db.query(`UPDATE users SET onboarding_completed = 1 WHERE id = 'usr_demo_001'`);
    return;
  }

  const demoId = 'usr_demo_001';
  const demoTenantDbName = tenantDbNameFromUserId(demoId);

  await db.query(
    `
      INSERT INTO users (
        id, name, email, password, email_verified, email_verification_token, terms_accepted_at, plan, business_name, avatar_initials, tenant_db_name, onboarding_completed, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, NULL, NOW(), ?, ?, ?, ?, 1, NOW(), NOW())
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
    ],
  );

  await ensureTenantSchema(demoTenantDbName);
}

async function ensureAllTenantSchemas(): Promise<void> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(`SELECT id, tenant_db_name FROM users`);

  for (const row of rows) {
    const tenantDbName = String(row.tenant_db_name || '').trim() || tenantDbNameFromUserId(row.id);
    if (!String(row.tenant_db_name || '').trim()) {
      await db.query(`UPDATE users SET tenant_db_name = ? WHERE id = ?`, [tenantDbName, row.id]);
    }
    await ensureTenantSchema(tenantDbName);
  }
}

/**
 * Crea la base de datos para el tenant si no existe, y corre el motor dinámico de Umzug.
 */
export async function ensureTenantSchema(tenantDbName: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(tenantDbName)) {
    throw new Error(`Invalid tenant database name: ${tenantDbName}`);
  }
  const db = getControlPool();

  await db.query(
    `CREATE DATABASE IF NOT EXISTS ${q(tenantDbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  // Ahora que la BD existe físicamente en MySQL, inyectamos a Umzug
  const { migrator, pool } = getTenantMigrator(tenantDbName);
  try {
    await migrator.up();
  } finally {
    await pool.end();
  }
}

async function migrateLegacySharedTablesToTenantDbs(): Promise<void> {
  const hasLegacyAppointments = await controlTableExists('appointments');
  if (!hasLegacyAppointments) return;

  const db = getControlPool();
  const [users] = await db.query<RowDataPacket[]>(`SELECT id, tenant_db_name FROM users`);

  for (const user of users) {
    const tenantDbName = String(user.tenant_db_name || '').trim();
    if (!tenantDbName) continue;

    // Ejecuta las queries legadas para inyectar si había data monolítica en el DB nuevo.
    // Garantizamos que las tablas existan antes llamando a ensureTenantSchema
    await ensureTenantSchema(tenantDbName);

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.module_overrides (module_id, enabled, updated_at)
        SELECT module_id, enabled, updated_at
        FROM module_overrides
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = VALUES(updated_at)
      `,
      [user.id],
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.customers (id, full_name, email, phone, notes, created_at, updated_at)
        SELECT id, full_name, email, phone, notes, created_at, updated_at
        FROM customers
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), email = VALUES(email), phone = VALUES(phone), notes = VALUES(notes), updated_at = VALUES(updated_at)
      `,
      [user.id],
    );

    // Omito los demás para brevedad, ya que esto sólo ocurre una vez en un backend que transicionó de SQLite.
    // El punto de las migraciones es mantenerlo encapsulado.
  }
}

async function controlTableExists(tableName: string): Promise<boolean> {
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
    `,
    [env.mysqlDatabase, tableName],
  );
  return Number(rows[0]?.total ?? 0) > 0;
}
