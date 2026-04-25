import { MigrationContext } from '../../migrator';
import { RowDataPacket } from 'mysql2/promise';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND COLUMN_NAME = 'description'
  `);

  if ((rows as RowDataPacket[]).length === 0) {
    await db.query(`
      ALTER TABLE services
      ADD COLUMN description TEXT NULL DEFAULT NULL
        AFTER name
    `);
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'services'
      AND COLUMN_NAME = 'description'
  `);

  if ((rows as RowDataPacket[]).length > 0) {
    await db.query(`ALTER TABLE services DROP COLUMN description`);
  }
}
