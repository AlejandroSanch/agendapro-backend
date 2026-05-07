import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query('SET FOREIGN_KEY_CHECKS=0');

  // 1. Limpiar datos relacionados
  await db.query('TRUNCATE TABLE notifications_log');
  await db.query('TRUNCATE TABLE loyalty_ledger');
  await db.query('TRUNCATE TABLE payments');
  await db.query('TRUNCATE TABLE sale_items');
  await db.query('TRUNCATE TABLE sales');
  await db.query('TRUNCATE TABLE appointment_services');
  await db.query('TRUNCATE TABLE appointments');
  await db.query('TRUNCATE TABLE customers');

  // 2. Eliminar llaves foraneas
  await db.query('ALTER TABLE appointments DROP FOREIGN KEY fk_appointments_customer');
  await db.query('ALTER TABLE appointment_services DROP FOREIGN KEY fk_apt_services_apt');
  await db.query('ALTER TABLE sales DROP FOREIGN KEY fk_sales_appointment');
  await db.query('ALTER TABLE sales DROP FOREIGN KEY fk_sales_customer');
  await db.query('ALTER TABLE loyalty_ledger DROP FOREIGN KEY fk_loyalty_ledger_customer');
  await db.query('ALTER TABLE notifications_log DROP FOREIGN KEY fk_notifications_customer');
  await db.query('ALTER TABLE notifications_log DROP FOREIGN KEY fk_notifications_appointment');

  // 3. Cambiar tipos de datos
  await db.query('ALTER TABLE customers MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE appointments MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE appointments MODIFY COLUMN customer_id INT NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN appointment_id INT NOT NULL');
  await db.query('ALTER TABLE sales MODIFY COLUMN appointment_id INT NULL, MODIFY COLUMN customer_id INT NOT NULL');
  await db.query('ALTER TABLE loyalty_ledger MODIFY COLUMN customer_id INT NOT NULL');
  await db.query('ALTER TABLE notifications_log MODIFY COLUMN customer_id INT NULL, MODIFY COLUMN appointment_id INT NULL');

  // 4. Restaurar llaves foraneas
  await db.query('ALTER TABLE appointments ADD CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_apt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE sales ADD CONSTRAINT fk_sales_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE sales ADD CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE loyalty_ledger ADD CONSTRAINT fk_loyalty_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE notifications_log ADD CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE notifications_log ADD CONSTRAINT fk_notifications_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE');

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  
  await db.query('SET FOREIGN_KEY_CHECKS=0');

  // Revertir a VARCHAR(64)
  await db.query('ALTER TABLE appointments DROP FOREIGN KEY fk_appointments_customer');
  await db.query('ALTER TABLE appointment_services DROP FOREIGN KEY fk_apt_services_apt');
  await db.query('ALTER TABLE sales DROP FOREIGN KEY fk_sales_appointment');
  await db.query('ALTER TABLE sales DROP FOREIGN KEY fk_sales_customer');
  await db.query('ALTER TABLE loyalty_ledger DROP FOREIGN KEY fk_loyalty_ledger_customer');
  await db.query('ALTER TABLE notifications_log DROP FOREIGN KEY fk_notifications_customer');
  await db.query('ALTER TABLE notifications_log DROP FOREIGN KEY fk_notifications_appointment');

  await db.query('ALTER TABLE customers MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE appointments MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE appointments MODIFY COLUMN customer_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN appointment_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE sales MODIFY COLUMN appointment_id VARCHAR(64) NULL, MODIFY COLUMN customer_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE loyalty_ledger MODIFY COLUMN customer_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE notifications_log MODIFY COLUMN customer_id VARCHAR(64) NULL, MODIFY COLUMN appointment_id VARCHAR(64) NULL');

  await db.query('ALTER TABLE appointments ADD CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_apt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE');
  await db.query('ALTER TABLE sales ADD CONSTRAINT fk_sales_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE sales ADD CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE loyalty_ledger ADD CONSTRAINT fk_loyalty_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await db.query('ALTER TABLE notifications_log ADD CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE');
  await db.query('ALTER TABLE notifications_log ADD CONSTRAINT fk_notifications_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE');

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}
