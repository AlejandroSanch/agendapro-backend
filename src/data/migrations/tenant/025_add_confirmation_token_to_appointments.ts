import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  // Ignoramos si la columna ya existe por si acaso
  try {
    await db.query(`
      ALTER TABLE appointments
      ADD COLUMN confirmation_token VARCHAR(64) NULL AFTER status
    `);
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`
    ALTER TABLE appointments
    DROP COLUMN confirmation_token
  `);
}
