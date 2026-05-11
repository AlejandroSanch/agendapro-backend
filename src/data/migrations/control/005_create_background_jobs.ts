import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      job_type VARCHAR(100) NOT NULL,
      payload JSON NOT NULL,
      status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      error_log TEXT NULL,
      run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status_run_at (status, run_at),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DROP TABLE IF EXISTS background_jobs;`);
}
