import { ensureControlDatabaseAndPool, getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

async function main() {
  await ensureControlDatabaseAndPool();
  const db = getControlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT name FROM `agendapro_tenant_usr_demo_001`.services WHERE deleted_at IS NOT NULL"
  );
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
