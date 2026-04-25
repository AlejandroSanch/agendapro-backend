import { initializeStore, ensureTenantSchema } from '../data/schema';
import { ensureControlDatabaseAndPool, getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

async function main() {
  console.log('Initializing store and running migrations...');
  await initializeStore();
  
  // Asegurarnos de que el tenant de demo esté actualizado
  const db = getControlPool();
  const [users] = await db.query<RowDataPacket[]>(
    "SELECT tenant_db_name FROM users WHERE email = 'demo@agendapro.com'"
  );
  if (users[0]) {
    console.log(`Running migrations for ${users[0].tenant_db_name}...`);
    await ensureTenantSchema(users[0].tenant_db_name);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
