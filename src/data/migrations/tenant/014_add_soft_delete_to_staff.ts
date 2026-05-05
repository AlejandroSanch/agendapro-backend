import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Añadir columna deleted_at
  await db.query(`
    ALTER TABLE staff 
    ADD COLUMN deleted_at DATETIME NULL AFTER is_active
  `);

  // 2. Añadir índice para optimizar filtrado por borrado
  await db.query(`
    CREATE INDEX idx_staff_deleted_at ON staff(deleted_at)
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DROP INDEX idx_staff_deleted_at ON staff`);
  await db.query(`ALTER TABLE staff DROP COLUMN deleted_at`);
}
