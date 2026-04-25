import { ensureControlDatabaseAndPool, getControlPool } from '../data/db';
import { RowDataPacket } from 'mysql2/promise';

async function main() {
  await ensureControlDatabaseAndPool();
  const db = getControlPool();

  const [users] = await db.query<RowDataPacket[]>(
    "SELECT id, tenant_db_name FROM users WHERE email = 'demo@agendapro.com'"
  );

  if (!users[0]) {
    console.log('Demo user not found');
    process.exit(1);
  }

  const tenantDb = users[0].tenant_db_name;
  console.log(`Checking tenant DB: ${tenantDb}`);

  const [services] = await db.query<RowDataPacket[]>(
    `SELECT s.id, s.name, COUNT(aps.id) as appointment_count 
     FROM \`${tenantDb}\`.services s
     JOIN \`${tenantDb}\`.appointment_services aps ON aps.service_id = s.id
     GROUP BY s.id, s.name`
  );

  console.log('\n--- Services with Appointments ---');
  for (const s of services) {
    console.log(`Service: ${s.name} (${s.id}) - Appointments: ${s.appointment_count}`);
    
    const [appointments] = await db.query<RowDataPacket[]>(
      `SELECT a.id, a.start_at, a.status, c.first_name, c.last_name
       FROM \`${tenantDb}\`.appointments a
       JOIN \`${tenantDb}\`.appointment_services aps ON aps.appointment_id = a.id
       JOIN \`${tenantDb}\`.customers c ON c.id = a.customer_id
       WHERE aps.service_id = ?`,
      [s.id]
    );

    for (const a of appointments) {
      console.log(`  - Appointment ${a.id}: ${a.start_at} (${a.status}) for ${a.first_name} ${a.last_name}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
