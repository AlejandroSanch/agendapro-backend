import { getControlPool } from '../data/db';

async function check() {
  const db = getControlPool();
  try {
    const [settings] = await db.query('SELECT * FROM tenant_1.business_settings');
    console.log('Business Settings:', settings);

    const [staff] = await db.query('SELECT id, first_name, has_custom_break, break_start, break_end FROM tenant_1.staff');
    console.log('Staff Breaks:', staff);
  } catch (e) {
    console.error('Error checking DB:', e);
  } finally {
    process.exit();
  }
}

check();
