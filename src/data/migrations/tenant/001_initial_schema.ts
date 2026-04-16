import { MigrationContext } from '../../migrator';
import mysql from 'mysql2/promise';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Configuración del Negocio
  await db.query(`
    CREATE TABLE IF NOT EXISTS business_settings (
      id INT PRIMARY KEY DEFAULT 1,
      business_type VARCHAR(64) NOT NULL DEFAULT '',
      phone VARCHAR(64) NOT NULL DEFAULT '',
      address VARCHAR(255) NOT NULL DEFAULT '',
      logo_url VARCHAR(512) NOT NULL DEFAULT '',
      timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
      currency_code VARCHAR(3) NOT NULL DEFAULT 'USD',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS business_hours (
      id INT PRIMARY KEY AUTO_INCREMENT,
      day_of_week TINYINT NOT NULL COMMENT '0=Dom, 1=Lun... 6=Sab',
      open_time TIME NOT NULL,
      close_time TIME NOT NULL,
      is_closed TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uniq_day_of_week (day_of_week)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS holidays_closures (
      id INT PRIMARY KEY AUTO_INCREMENT,
      closure_date DATE NOT NULL,
      reason VARCHAR(255) NULL,
      UNIQUE KEY uniq_closure_date (closure_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Módulo Overrides a nivel local
  await db.query(`
    CREATE TABLE IF NOT EXISTS module_overrides (
      module_id VARCHAR(64) PRIMARY KEY,
      enabled TINYINT(1) NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. Catálogo y Servicios
  await db.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      description TEXT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      category_id VARCHAR(64) NULL,
      name VARCHAR(255) NOT NULL,
      duration_minutes INT NOT NULL,
      price_cents INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      display_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_services_name (name),
      INDEX idx_services_order (display_order),
      CONSTRAINT fk_services_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Personal (Staff)
  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(64) PRIMARY KEY,
      role_id VARCHAR(64) NOT NULL,
      first_name VARCHAR(128) NOT NULL,
      last_name VARCHAR(128) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(64) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_staff_email (email),
      CONSTRAINT fk_staff_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_services (
      staff_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (staff_id, service_id),
      CONSTRAINT fk_staff_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_staff_services_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_schedules (
      id VARCHAR(64) PRIMARY KEY,
      staff_id VARCHAR(64) NOT NULL,
      day_of_week TINYINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      CONSTRAINT fk_staff_schedules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff_time_off (
      id VARCHAR(64) PRIMARY KEY,
      staff_id VARCHAR(64) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason VARCHAR(255) NULL,
      status ENUM('approved', 'pending') NOT NULL DEFAULT 'approved',
      CONSTRAINT fk_staff_time_off_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. Inventario
  await db.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      supplier_id VARCHAR(64) NULL,
      sku VARCHAR(255) NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      price_cents INT NOT NULL,
      cost_cents INT NOT NULL DEFAULT 0,
      stock_quantity INT NOT NULL DEFAULT 0,
      reorder_alert_level INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id VARCHAR(64) PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL,
      type ENUM('in', 'out', 'adjustment', 'sale') NOT NULL,
      quantity INT NOT NULL,
      notes VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inventory_logs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. Clientes y Fidelización
  await db.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(64) PRIMARY KEY,
      first_name VARCHAR(128) NOT NULL,
      last_name VARCHAR(128) NOT NULL,
      email VARCHAR(255) NULL UNIQUE,
      phone VARCHAR(64) NULL,
      birth_date DATE NULL,
      notes TEXT NULL,
      current_loyalty_points INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_name (last_name, first_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS loyalty_ledger (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      points_change INT NOT NULL,
      reason VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_loyalty_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. Citas
  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      status ENUM('scheduled','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      notes TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_appointments_start (start_at),
      CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS appointment_services (
      id VARCHAR(64) PRIMARY KEY,
      appointment_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NOT NULL,
      staff_id VARCHAR(64) NOT NULL,
      service_start_time TIME NULL,
      service_end_time TIME NULL,
      price_applied_cents INT NOT NULL DEFAULT 0,
      CONSTRAINT fk_apt_services_apt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_apt_services_srv FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_apt_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 8. Pagos y Caja
  await db.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(64) PRIMARY KEY,
      appointment_id VARCHAR(64) NULL,
      customer_id VARCHAR(64) NOT NULL,
      subtotal_cents INT NOT NULL DEFAULT 0,
      tax_cents INT NOT NULL DEFAULT 0,
      total_cents INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id VARCHAR(64) PRIMARY KEY,
      sale_id VARCHAR(64) NOT NULL,
      service_id VARCHAR(64) NULL,
      product_id VARCHAR(64) NULL,
      quantity INT NOT NULL DEFAULT 1,
      unit_price_cents INT NOT NULL,
      CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_sale_items_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(64) PRIMARY KEY,
      sale_id VARCHAR(64) NOT NULL,
      amount_cents INT NOT NULL,
      method ENUM('cash', 'card', 'transfer', 'loyalty_points') NOT NULL,
      paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 9. Comisiones
  await db.query(`
    CREATE TABLE IF NOT EXISTS commission_rules (
      id VARCHAR(64) PRIMARY KEY,
      staff_id VARCHAR(64) NOT NULL,
      type ENUM('service_percentage', 'service_flat', 'product_percentage') NOT NULL,
      value INT NOT NULL,
      CONSTRAINT fk_comm_rules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS commissions (
      id VARCHAR(64) PRIMARY KEY,
      staff_id VARCHAR(64) NOT NULL,
      sale_item_id VARCHAR(64) NOT NULL,
      amount_cents INT NOT NULL,
      status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
      calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_commissions_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_commissions_sale_item FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 10. Notificaciones
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications_log (
      id VARCHAR(64) PRIMARY KEY,
      customer_id VARCHAR(64) NULL,
      appointment_id VARCHAR(64) NULL,
      channel ENUM('email', 'whatsapp', 'sms') NOT NULL,
      subject VARCHAR(255) NULL,
      body TEXT NOT NULL,
      status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT fk_notifications_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  // En caso de querer desarmar la base de datos inquilina
}
