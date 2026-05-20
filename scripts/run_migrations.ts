import * as dotenv from 'dotenv';
dotenv.config();
import { getTenantMigrator } from '../src/data/migrator';
import { getControlPool, ensureControlDatabaseAndPool } from '../src/data/db';

async function run() {
  await ensureControlDatabaseAndPool();
  const db = getControlPool();
  try {
    const [tenants] = await db.query<any[]>('SELECT tenant_db_name FROM users WHERE tenant_db_name IS NOT NULL');
    console.log(`Found ${tenants.length} tenants. Running migrations...`);
    for (const tenant of tenants) {
      console.log(`Migrating ${tenant.tenant_db_name}...`);
      const { migrator, pool } = getTenantMigrator(tenant.tenant_db_name);
      try {
        await migrator.up();
      } finally {
        await pool.end();
      }
    }
    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

run();
