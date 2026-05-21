import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  try {
    await db.query(`
      ALTER TABLE users
        ADD COLUMN password_reset_token VARCHAR(255) NULL DEFAULT NULL,
        ADD COLUMN password_reset_expires DATETIME NULL DEFAULT NULL
    `);
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    ALTER TABLE users
      DROP COLUMN password_reset_token,
      DROP COLUMN password_reset_expires
  `);
}
