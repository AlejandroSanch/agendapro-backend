import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  try {
    // 1. Añadir columna deleted_at
    await db.query(`
      ALTER TABLE services 
      ADD COLUMN deleted_at DATETIME NULL AFTER is_active
    `);

    // 2. Añadir índice para optimizar filtrado por borrado
    await db.query(`
      CREATE INDEX idx_services_deleted_at ON services(deleted_at)
    `);
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_DUP_KEYNAME') throw err;
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DROP INDEX idx_services_deleted_at ON services`);
  await db.query(`ALTER TABLE services DROP COLUMN deleted_at`);
}
