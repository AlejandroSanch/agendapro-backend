import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointment_tenant_map (
      appointment_id VARCHAR(64) NOT NULL,
      tenant_db_name VARCHAR(128) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (appointment_id),
      INDEX idx_atm_tenant (tenant_db_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  await context.connection.query(`DROP TABLE IF EXISTS appointment_tenant_map`);
}
