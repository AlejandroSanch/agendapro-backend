import { MigrationContext } from '../../migrator';

/**
 * Expands the business_settings address from a single field to structured columns.
 */
export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  const cols = [
    { name: 'street', def: "VARCHAR(255) NOT NULL DEFAULT ''" },
    { name: 'ext_number', def: "VARCHAR(32) NOT NULL DEFAULT ''" },
    { name: 'int_number', def: "VARCHAR(32) NOT NULL DEFAULT ''" },
    { name: 'neighborhood', def: "VARCHAR(128) NOT NULL DEFAULT ''" },
    { name: 'city', def: "VARCHAR(128) NOT NULL DEFAULT ''" },
    { name: 'state', def: "VARCHAR(128) NOT NULL DEFAULT ''" },
    { name: 'zip_code', def: "VARCHAR(16) NOT NULL DEFAULT ''" },
  ];

  for (const col of cols) {
    const [existing] = await db.query<any[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = ?`,
      [col.name]
    );
    if (existing.length === 0) {
      await db.query(`ALTER TABLE business_settings ADD COLUMN ${col.name} ${col.def}`);
    }
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  const cols = ['street', 'ext_number', 'int_number', 'neighborhood', 'city', 'state', 'zip_code'];
  for (const col of cols) {
    await db.query(`ALTER TABLE business_settings DROP COLUMN IF EXISTS ${col}`);
  }
}
