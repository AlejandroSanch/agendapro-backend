import { MigrationContext } from '../../migrator';

/**
 * Adds a `has_custom_schedule` flag to the staff table so we can distinguish
 * between staff that inherit business hours vs those with their own schedule.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // Check if column already exists
  const [cols] = await db.query<any[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'has_custom_schedule'`
  );

  if (cols.length === 0) {
    await db.query(`ALTER TABLE staff ADD COLUMN has_custom_schedule TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`);
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`ALTER TABLE staff DROP COLUMN IF EXISTS has_custom_schedule`);
}
