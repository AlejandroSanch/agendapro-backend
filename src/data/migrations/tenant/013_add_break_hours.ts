import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // Hora de descanso a nivel negocio
  await db.query(`
    ALTER TABLE business_settings
      ADD COLUMN break_enabled TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN break_start TIME NULL,
      ADD COLUMN break_end TIME NULL
  `);

  // Hora de descanso personalizada por trabajador
  await db.query(`
    ALTER TABLE staff
      ADD COLUMN has_custom_break TINYINT(1) NOT NULL DEFAULT 0,
      ADD COLUMN break_start TIME NULL,
      ADD COLUMN break_end TIME NULL
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    ALTER TABLE staff
      DROP COLUMN has_custom_break,
      DROP COLUMN break_start,
      DROP COLUMN break_end
  `);

  await db.query(`
    ALTER TABLE business_settings
      DROP COLUMN break_enabled,
      DROP COLUMN break_start,
      DROP COLUMN break_end
  `);
}
