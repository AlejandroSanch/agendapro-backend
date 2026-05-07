import { Connection } from 'mysql2/promise';

export async function up(db: Connection): Promise<void> {
  await db.query(`
    ALTER TABLE users 
    ADD COLUMN trial_end_date DATETIME NULL AFTER avatar_initials
  `);
}

export async function down(db: Connection): Promise<void> {
  await db.query(`
    ALTER TABLE users 
    DROP COLUMN trial_end_date
  `);
}
