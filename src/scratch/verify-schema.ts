import { getControlPool, ensureControlDatabaseAndPool } from '../data/db';
import { q } from '../data/utils';

async function verifyColumns() {
  await ensureControlDatabaseAndPool();
  const db = getControlPool();
  const tenantDb = 'db_usr_demo_001';
  
  console.log('Verifying products columns...');
  const [columns] = await db.query(`SHOW COLUMNS FROM ${q(tenantDb)}.products`);
  console.table(columns);

  console.log('Verifying inventory_logs columns...');
  const [logColumns] = await db.query(`SHOW COLUMNS FROM ${q(tenantDb)}.inventory_logs`);
  console.table(logColumns);

  process.exit(0);
}

verifyColumns().catch(err => {
  console.error(err);
  process.exit(1);
});
