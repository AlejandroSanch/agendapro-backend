import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // Set the effective_from to '2000-01-01' for all existing records
  await db.query(`
    ALTER TABLE staff_schedules
    ADD COLUMN effective_from DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00',
    ADD COLUMN effective_to DATETIME NULL DEFAULT NULL;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`
    ALTER TABLE staff_schedules
    DROP COLUMN effective_from,
    DROP COLUMN effective_to;
  `);
}
