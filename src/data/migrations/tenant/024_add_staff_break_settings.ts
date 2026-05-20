import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_break_settings (
      id INT PRIMARY KEY AUTO_INCREMENT,
      staff_id INT NULL,
      break_enabled TINYINT(1) NOT NULL DEFAULT 0,
      break_start TIME NULL,
      break_end TIME NULL,
      effective_from DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00',
      effective_to DATETIME NULL DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_staff_break_settings_staff (staff_id),
      CONSTRAINT fk_staff_break_settings_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Migrate existing global break settings
  await db.query(`
    INSERT INTO staff_break_settings (staff_id, break_enabled, break_start, break_end)
    SELECT NULL, break_enabled, break_start, break_end
    FROM business_settings
    LIMIT 1;
  `);

  // Migrate existing staff break settings
  await db.query(`
    INSERT INTO staff_break_settings (staff_id, break_enabled, break_start, break_end)
    SELECT id, has_custom_break, break_start, break_end
    FROM staff
    WHERE deleted_at IS NULL;
  `);

  // Delete all recurrent blocks from staff_blocks since they are now dynamically calculated
  await db.query(`
    DELETE FROM staff_blocks WHERE is_recurrent = 1;
  `);

  // Drop old columns
  await db.query(`ALTER TABLE business_settings DROP COLUMN break_enabled, DROP COLUMN break_start, DROP COLUMN break_end;`);
  await db.query(`ALTER TABLE staff DROP COLUMN has_custom_break, DROP COLUMN break_start, DROP COLUMN break_end;`);
  await db.query(`ALTER TABLE staff_blocks DROP COLUMN is_recurrent;`);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  
  await db.query(`ALTER TABLE staff_blocks ADD COLUMN is_recurrent TINYINT(1) NOT NULL DEFAULT 0;`);
  
  await db.query(`ALTER TABLE staff ADD COLUMN has_custom_break TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN break_start TIME NULL, ADD COLUMN break_end TIME NULL;`);
  
  await db.query(`ALTER TABLE business_settings ADD COLUMN break_enabled TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN break_start TIME NULL, ADD COLUMN break_end TIME NULL;`);

  await db.query(`DROP TABLE IF EXISTS staff_break_settings;`);
}
