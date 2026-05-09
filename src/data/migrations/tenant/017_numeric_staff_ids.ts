import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query('SET FOREIGN_KEY_CHECKS=0');

  const dropFk = async (table: string, fk: string) => {
    try {
      await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`);
    } catch (e: any) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  };

  // 1. Limpiar datos dependientes de staff
  await db.query('TRUNCATE TABLE commissions');
  await db.query('TRUNCATE TABLE commission_rules');
  await db.query('TRUNCATE TABLE staff_time_off');
  await db.query('TRUNCATE TABLE staff_schedules');
  await db.query('TRUNCATE TABLE staff_services');
  await db.query('TRUNCATE TABLE appointment_services');
  await db.query('TRUNCATE TABLE inventory_logs');
  await db.query('TRUNCATE TABLE staff');
  await db.query('TRUNCATE TABLE roles');

  // 2. Eliminar llaves foraneas de roles
  await dropFk('staff', 'fk_staff_role');

  // 3. Eliminar llaves foraneas de staff
  await dropFk('staff_services', 'fk_staff_services_staff');
  await dropFk('staff_schedules', 'fk_staff_schedules_staff');
  await dropFk('staff_time_off', 'fk_staff_time_off_staff');
  await dropFk('appointment_services', 'fk_apt_services_staff');
  await dropFk('commission_rules', 'fk_comm_rules_staff');
  // Legacy FK from earlier development sessions (staff_time_blocks table)
  await dropFk('staff_time_blocks', 'fk_staff_time_blocks_staff');
  await dropFk('commissions', 'fk_commissions_staff');
  await dropFk('inventory_logs', 'fk_inventory_logs_staff');

  // 4. Cambiar tipo de roles.id
  await db.query('ALTER TABLE roles MODIFY COLUMN id INT AUTO_INCREMENT');

  // 5. Cambiar tipo de staff.id y staff.role_id
  await db.query('ALTER TABLE staff MODIFY COLUMN id INT AUTO_INCREMENT');
  await db.query('ALTER TABLE staff MODIFY COLUMN role_id INT NOT NULL');

  // 6. Cambiar tipo en tablas dependientes
  await db.query('ALTER TABLE staff_services MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE staff_schedules MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE staff_time_off MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE commission_rules MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE commissions MODIFY COLUMN staff_id INT NOT NULL');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN staff_id INT NULL');

  // 7. Restaurar llaves foraneas
  await db.query(
    'ALTER TABLE staff ADD CONSTRAINT fk_staff_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_services ADD CONSTRAINT fk_staff_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_time_off ADD CONSTRAINT fk_staff_time_off_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE commission_rules ADD CONSTRAINT fk_comm_rules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE commissions ADD CONSTRAINT fk_commissions_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE inventory_logs ADD CONSTRAINT fk_inventory_logs_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE',
  );

  // 8. Re-insertar roles por defecto con IDs numéricos
  await db.query(`INSERT INTO roles (id, name) VALUES (1, 'admin'), (2, 'staff'), (3, 'viewer')`);

  // 9. Limpiar nombres con patrón [BORRADO] de registros que pudieran quedar
  // (aunque TRUNCATE los borró, esto es una precaución para datos futuros)

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  await db.query('SET FOREIGN_KEY_CHECKS=0');

  const dropFk = async (table: string, fk: string) => {
    try {
      await db.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`);
    } catch (e: any) {
      if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY' && e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  };

  await dropFk('staff', 'fk_staff_role');
  await dropFk('staff_services', 'fk_staff_services_staff');
  await dropFk('staff_schedules', 'fk_staff_schedules_staff');
  await dropFk('staff_time_off', 'fk_staff_time_off_staff');
  await dropFk('appointment_services', 'fk_apt_services_staff');
  await dropFk('commission_rules', 'fk_comm_rules_staff');
  await dropFk('commissions', 'fk_commissions_staff');
  await dropFk('inventory_logs', 'fk_inventory_logs_staff');

  await db.query('ALTER TABLE roles MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE staff MODIFY COLUMN id VARCHAR(64)');
  await db.query('ALTER TABLE staff MODIFY COLUMN role_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE staff_services MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE staff_schedules MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE staff_time_off MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE appointment_services MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE commission_rules MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE commissions MODIFY COLUMN staff_id VARCHAR(64) NOT NULL');
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN staff_id VARCHAR(64) NULL');

  await db.query(
    'ALTER TABLE staff ADD CONSTRAINT fk_staff_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_services ADD CONSTRAINT fk_staff_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_schedules ADD CONSTRAINT fk_staff_schedules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE staff_time_off ADD CONSTRAINT fk_staff_time_off_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE appointment_services ADD CONSTRAINT fk_apt_services_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE commission_rules ADD CONSTRAINT fk_comm_rules_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE commissions ADD CONSTRAINT fk_commissions_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await db.query(
    'ALTER TABLE inventory_logs ADD CONSTRAINT fk_inventory_logs_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL ON UPDATE CASCADE',
  );

  // Re-insertar roles con IDs originales
  await db.query(
    `INSERT IGNORE INTO roles (id, name) VALUES ('role_admin', 'admin'), ('role_staff', 'staff'), ('role_viewer', 'viewer')`,
  );

  await db.query('SET FOREIGN_KEY_CHECKS=1');
}
