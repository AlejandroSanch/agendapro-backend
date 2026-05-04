import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_integrations (
      user_id VARCHAR(64) NOT NULL,
      provider VARCHAR(64) NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NULL,
      expires_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DROP TABLE IF EXISTS tenant_integrations`);
}
