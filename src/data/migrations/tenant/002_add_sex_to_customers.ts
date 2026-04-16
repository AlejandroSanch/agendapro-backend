import { MigrationContext } from '../../migrator';
import { RowDataPacket } from 'mysql2/promise';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // Verificamos si la columna `sex` ya existe antes de agregarla
  // (ADD COLUMN IF NOT EXISTS no existe en MySQL 5.7)
  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customers'
      AND COLUMN_NAME = 'sex'
  `);

  if ((rows as RowDataPacket[]).length === 0) {
    await db.query(`
      ALTER TABLE customers
      ADD COLUMN sex ENUM('masculino', 'femenino', 'otro') NULL DEFAULT NULL
        AFTER birth_date
    `);
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'customers'
      AND COLUMN_NAME = 'sex'
  `);

  if ((rows as RowDataPacket[]).length > 0) {
    await db.query(`ALTER TABLE customers DROP COLUMN sex`);
  }
}
