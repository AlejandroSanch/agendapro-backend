import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // Add type column. Default to 'product' so that existing categories show up in inventory.
  await db.query(`
    ALTER TABLE categories 
    ADD COLUMN type ENUM('service', 'product') NOT NULL DEFAULT 'product'
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    ALTER TABLE categories 
    DROP COLUMN type
  `);
}
