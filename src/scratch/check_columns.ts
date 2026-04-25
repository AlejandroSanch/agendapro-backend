import { ensureControlDatabaseAndPool, getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

async function main() {
  await ensureControlDatabaseAndPool();
  const db = getControlPool();

  const [users] = await db.query<RowDataPacket[]>(
    "SELECT tenant_db_name FROM users WHERE email = 'demo@agendapro.com'"
  );

  const tenantDb = users[0].tenant_db_name;
  console.log(`Checking tenant DB: ${tenantDb}`);

  const [columns] = await db.query<RowDataPacket[]>(
    `SHOW COLUMNS FROM \`${tenantDb}\`.services`
  );

  console.log('Columns in services table:');
  columns.forEach(c => console.log(`- ${c.Field}`));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
