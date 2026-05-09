import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Expandir tabla products
  await db.query(`
    ALTER TABLE products 
    ADD COLUMN category_id VARCHAR(64) NULL AFTER supplier_id,
    ADD COLUMN unit VARCHAR(32) NOT NULL DEFAULT 'pieza' AFTER name,
    ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE;
  `);

  // 2. Expandir tabla inventory_logs
  // Nota: MySQL no permite modificar ENUM fácilmente con ALTER TABLE sin recrearlo o usar trucos,
  // pero aquí simplemente lo re-definimos.
  await db.query(`
    ALTER TABLE inventory_logs
    MODIFY COLUMN type ENUM('in', 'out', 'adjustment', 'sale', 'service') NOT NULL,
    ADD COLUMN stock_before INT NOT NULL DEFAULT 0 AFTER quantity,
    ADD COLUMN stock_after INT NOT NULL DEFAULT 0 AFTER stock_before,
    ADD COLUMN staff_id VARCHAR(64) NULL AFTER stock_after,
    ADD CONSTRAINT fk_inventory_logs_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE;
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query(`ALTER TABLE inventory_logs DROP FOREIGN KEY fk_inventory_logs_staff;`);
  await db.query(
    `ALTER TABLE inventory_logs DROP COLUMN staff_id, DROP COLUMN stock_before, DROP COLUMN stock_after;`,
  );
  await db.query(
    `ALTER TABLE inventory_logs MODIFY COLUMN type ENUM('in', 'out', 'adjustment', 'sale') NOT NULL;`,
  );

  await db.query(`ALTER TABLE products DROP FOREIGN KEY fk_products_category;`);
  await db.query(`ALTER TABLE products DROP COLUMN category_id, DROP COLUMN unit;`);
}
