import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    ALTER TABLE staff_blocks
    ADD COLUMN is_recurrent TINYINT(1) NOT NULL DEFAULT 0 AFTER end_at;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`
    ALTER TABLE staff_blocks
    DROP COLUMN is_recurrent;
  `);
}
