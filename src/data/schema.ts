import mysql, { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { getControlPool, ensureControlDatabaseAndPool } from './db';
import { hashPassword, q, tenantDbNameFromUserId } from './utils';

let initializingPromise: Promise<void> | null = null;

export async function initializeStore(): Promise<void> {
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

  try { await db.query(`ALTER TABLE users ADD COLUMN tenant_db_name VARCHAR(128) NULL`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  try { await db.query(`ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  try { await db.query(`ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(128) NULL`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  try { await db.query(`ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME NULL`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  try { await db.query(`CREATE UNIQUE INDEX idx_users_email_verification_token ON users (email_verification_token)`); } catch (e: any) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }
  try { await db.query(`ALTER TABLE users ADD COLUMN onboarding_completed TINYINT(1) NOT NULL DEFAULT 0`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }

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
  if (total > 0) return;

  const demoId = 'usr_demo_001';
  const demoTenantDbName = tenantDbNameFromUserId(demoId);

  await db.query(
    `
      INSERT INTO users (
        id, name, email, password, email_verified, email_verification_token, terms_accepted_at, plan, business_name, avatar_initials, tenant_db_name, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 1, NULL, NOW(), ?, ?, ?, ?, NOW(), NOW())
    `,
    [demoId, 'Daniel Hernandez', 'demo@agendapro.com', hashPassword('demo123'), 'pro', 'Mi Negocio', 'DH', demoTenantDbName]
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

export async function ensureTenantSchema(tenantDbName: string): Promise<void> {
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
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS ${q(tenantDbName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

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

    try { await adminPool.query(`ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN category VARCHAR(64) NOT NULL DEFAULT 'general'`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await adminPool.query(`ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN description TEXT NULL`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await adminPool.query(`ALTER TABLE ${q(tenantDbName)}.services ADD COLUMN display_order INT NOT NULL DEFAULT 0`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
    try { await adminPool.query(`CREATE INDEX idx_services_order ON ${q(tenantDbName)}.services (display_order)`); } catch (e: any) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }

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

    try { await adminPool.query(`ALTER TABLE ${q(tenantDbName)}.staff ADD COLUMN specialties JSON NOT NULL DEFAULT (JSON_ARRAY())`); } catch (e: any) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  } finally {
    await adminPool.end();
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

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.module_overrides (module_id, enabled, updated_at)
        SELECT module_id, enabled, updated_at
        FROM module_overrides
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.customers (id, full_name, email, phone, notes, created_at, updated_at)
        SELECT id, full_name, email, phone, notes, created_at, updated_at
        FROM customers
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), email = VALUES(email), phone = VALUES(phone), notes = VALUES(notes), updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.services (id, name, category, description, duration_minutes, price_cents, display_order, is_active, created_at, updated_at)
        SELECT id, name, 'general' AS category, '' AS description, duration_minutes, price_cents, 0 AS display_order, is_active, created_at, updated_at
        FROM services
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), description = VALUES(description), duration_minutes = VALUES(duration_minutes), price_cents = VALUES(price_cents), display_order = VALUES(display_order), is_active = VALUES(is_active), updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.staff (id, full_name, email, phone, role, is_active, created_at, updated_at)
        SELECT id, full_name, email, phone, role, is_active, created_at, updated_at
        FROM staff
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), email = VALUES(email), phone = VALUES(phone), role = VALUES(role), is_active = VALUES(is_active), updated_at = VALUES(updated_at)
      `,
      [user.id]
    );

    await db.query(
      `
        INSERT INTO ${q(tenantDbName)}.appointments (id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at)
        SELECT id, customer_id, service_id, staff_id, title, status, start_at, end_at, notes, created_at, updated_at
        FROM appointments
        WHERE user_id = ?
        ON DUPLICATE KEY UPDATE customer_id = VALUES(customer_id), service_id = VALUES(service_id), staff_id = VALUES(staff_id), title = VALUES(title), status = VALUES(status), start_at = VALUES(start_at), end_at = VALUES(end_at), notes = VALUES(notes), updated_at = VALUES(updated_at)
      `,
      [user.id]
    );
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
    [env.mysqlDatabase, tableName]
  );
  return Number(rows[0]?.total ?? 0) > 0;
}
