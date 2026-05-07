import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query('SET FOREIGN_KEY_CHECKS=0');

  // 1. Limpiar datos de las tablas afectadas (Truncate)
  const tablesToTruncate = [
    'categories',
    'services',
    'staff_services',
    'staff_schedules',
    'staff_time_off',
    'suppliers',
    'products',
    'inventory_logs',
    'sales',
    'sale_items',
    'payments',
    'commission_rules',
    'commissions',
    'notifications_log',
    'system_notifications',
    'appointment_services'
  ];

  for (const table of tablesToTruncate) {
    await db.query(`TRUNCATE TABLE ${table}`);
  }

  // 2. Eliminar llaves foráneas
  const fksToDrop = [
    { table: 'services', fk: 'fk_services_category' },
    { table: 'products', fk: 'fk_products_category' }, // Legacy FK from earlier dev sessions
    { table: 'staff_services', fk: 'fk_staff_services_service' },
    { table: 'appointment_services', fk: 'fk_apt_services_srv' },
    { table: 'sale_items', fk: 'fk_sale_items_service' },
    { table: 'products', fk: 'fk_products_supplier' },
    { table: 'inventory_logs', fk: 'fk_inventory_logs_product' },
    { table: 'sale_items', fk: 'fk_sale_items_product' },
    { table: 'sale_items', fk: 'fk_sale_items_sale' },
    { table: 'payments', fk: 'fk_payments_sale' },
    { table: 'commissions', fk: 'fk_commissions_sale_item' }
  ];


  const dropFk = async (table: string, fk: string) => {
    try {
      await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`);
    } catch (e: any) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  };

  for (const item of fksToDrop) {
    await dropFk(item.table, item.fk);
  }

  // 3. Modificar PKs y FKs a INT y AUTO_INCREMENT
  
  // Categories & Services
  await db.query('ALTER TABLE categories MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE services MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE services MODIFY COLUMN category_id INT NULL');
  await db.query('ALTER TABLE staff_services MODIFY COLUMN service_id INT NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN service_id INT NOT NULL');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN service_id INT NULL');

  // Inventory (Suppliers, Products, Logs)
  await db.query('ALTER TABLE suppliers MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE products MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE products MODIFY COLUMN supplier_id INT NULL');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN product_id INT NOT NULL');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN product_id INT NULL');

  // Sales & Payments
  await db.query('ALTER TABLE sales MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN sale_id INT NOT NULL');
  await db.query('ALTER TABLE payments MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE payments MODIFY COLUMN sale_id INT NOT NULL');
  await db.query('ALTER TABLE commissions MODIFY COLUMN sale_item_id INT NOT NULL');

  // Misc tables PKs
  await db.query('ALTER TABLE staff_schedules MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE staff_time_off MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE commission_rules MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE commissions MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE notifications_log MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE system_notifications MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN id INT AUTO_INCREMENT');

  // 4. Recrear llaves foráneas
  await db.query('ALTER TABLE services ADD CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE staff_services ADD CONSTRAINT fk_staff_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_srv FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE');
  
  await db.query('ALTER TABLE products ADD CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE inventory_logs ADD CONSTRAINT fk_inventory_logs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE');

  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE payments ADD CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE commissions ADD CONSTRAINT fk_commissions_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE ON UPDATE CASCADE');

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query('SET FOREIGN_KEY_CHECKS=0');

  // Revert constraints
  const fksToDrop = [
    { table: 'services', fk: 'fk_services_category' },
    { table: 'staff_services', fk: 'fk_staff_services_service' },
    { table: 'appointment_services', fk: 'fk_apt_services_srv' },
    { table: 'sale_items', fk: 'fk_sale_items_service' },
    { table: 'products', fk: 'fk_products_supplier' },
    { table: 'inventory_logs', fk: 'fk_inventory_logs_product' },
    { table: 'sale_items', fk: 'fk_sale_items_product' },
    { table: 'sale_items', fk: 'fk_sale_items_sale' },
    { table: 'payments', fk: 'fk_payments_sale' },
    { table: 'commissions', fk: 'fk_commissions_sale_item' }
  ];

  const dropFk = async (table: string, fk: string) => {
    try {
      await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`);
    } catch (e: any) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw e;
    }
  };

  for (const item of fksToDrop) {
    await dropFk(item.table, item.fk);
  }

  // Categories & Services
  await db.query('ALTER TABLE categories MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE services MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE services MODIFY COLUMN category_id VARCHAR(64) NULL');
  await db.query('ALTER TABLE staff_services MODIFY COLUMN service_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN service_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN service_id VARCHAR(64) NULL');

  // Inventory (Suppliers, Products, Logs)
  await db.query('ALTER TABLE suppliers MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE products MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE products MODIFY COLUMN supplier_id VARCHAR(64) NULL');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN product_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN product_id VARCHAR(64) NULL');

  // Sales & Payments
  await db.query('ALTER TABLE sales MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE sale_items MODIFY COLUMN sale_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE payments MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE payments MODIFY COLUMN sale_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE commissions MODIFY COLUMN sale_item_id VARCHAR(64) NOT NULL');

  // Misc tables PKs
  await db.query('ALTER TABLE staff_schedules MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE staff_time_off MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE commission_rules MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE commissions MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE notifications_log MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE system_notifications MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN id VARCHAR(64)');

  // Re-add Constraints
  await db.query('ALTER TABLE services ADD CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE staff_services ADD CONSTRAINT fk_staff_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_srv FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE');
  
  await db.query('ALTER TABLE products ADD CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE inventory_logs ADD CONSTRAINT fk_inventory_logs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE');

  await db.query('ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE payments ADD CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE commissions ADD CONSTRAINT fk_commissions_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE ON UPDATE CASCADE');

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}
