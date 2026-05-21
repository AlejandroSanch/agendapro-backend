import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  try {
    await context.connection.query(`
      ALTER TABLE users 
      ADD COLUMN trial_end_date DATETIME NULL AFTER avatar_initials
    `);
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  await context.connection.query(`
    ALTER TABLE users 
    DROP COLUMN trial_end_date
  `);
}
