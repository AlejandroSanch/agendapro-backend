import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    INSERT IGNORE INTO roles (id, name) VALUES
      ('role_admin', 'admin'),
      ('role_staff', 'staff'),
      ('role_viewer', 'viewer')
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DELETE FROM roles WHERE id IN ('role_admin', 'role_staff', 'role_viewer')`);
}
