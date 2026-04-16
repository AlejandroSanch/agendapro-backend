import { MigrationContext } from '../../migrator';
import { env } from '../../../config/env';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

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
      onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  try { await db.query(`CREATE UNIQUE INDEX idx_users_email_verification_token ON users (email_verification_token)`); } catch (e: any) { if (e.code !== 'ER_DUP_KEYNAME') throw e; }

  await db.query(`
    CREATE TABLE IF NOT EXISTS module_overrides (
      user_id VARCHAR(64) NOT NULL,
      module_id VARCHAR(64) NOT NULL,
      enabled TINYINT(1) NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, module_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

}

// Opcional
export async function down({ context }: { context: MigrationContext }): Promise<void> {
  // Las migraciones iniciales son difíciles de retroceder en BDs de control sin perder a los clientes, así que usualmente se dejan vacías.
}
