import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_blocks (
      id INT PRIMARY KEY AUTO_INCREMENT,
      staff_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_staff_blocks_staff (staff_id),
      INDEX idx_staff_blocks_start (start_at),
      CONSTRAINT fk_staff_blocks_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`DROP TABLE IF EXISTS staff_blocks;`);
}
