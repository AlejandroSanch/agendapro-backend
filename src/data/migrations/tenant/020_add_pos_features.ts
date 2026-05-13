import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    ALTER TABLE sales 
    ADD COLUMN discount_cents INT NOT NULL DEFAULT 0 AFTER subtotal_cents,
    ADD COLUMN notes TEXT NULL AFTER total_cents;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`ALTER TABLE sales DROP COLUMN discount_cents, DROP COLUMN notes;`);
}
