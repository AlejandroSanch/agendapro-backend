const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const args = process.argv.slice(2);
const requestedUserId = readArg('--user');
const requestedEmail = readArg('--email');
const showDetails = args.includes('--details');

const mysqlHost = (process.env.MYSQL_HOST || '127.0.0.1').trim();
const mysqlPort = Number(process.env.MYSQL_PORT || 3306);
const mysqlUser = (process.env.MYSQL_USER || 'root').trim();
const mysqlPassword = process.env.MYSQL_PASSWORD || '';
const mysqlDatabase = (process.env.MYSQL_DATABASE || 'agendapro').trim();
const tenantPrefix = (process.env.MYSQL_TENANT_DB_PREFIX || 'agendapro_tenant_').trim();

async function main() {
  const pool = mysql.createPool({
    host: mysqlHost,
    port: mysqlPort,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDatabase,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    dateStrings: true,
  });

  try {
    const [users] = await pool.query(
      `
        SELECT id, email, plan, business_name, tenant_db_name
        FROM users
        ORDER BY email ASC
      `
    );

    const filtered = users.filter((user) => {
      if (requestedUserId && user.id !== requestedUserId) return false;
      if (requestedEmail && String(user.email).toLowerCase() !== requestedEmail.toLowerCase()) return false;
      return true;
    });

    if (filtered.length === 0) {
      console.log('No se encontraron usuarios con ese filtro.');
      return;
    }

    const [tenantDbs] = await pool.query(
      `
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE ?
        ORDER BY schema_name
      `,
      [`${tenantPrefix}%`]
    );

    console.log('');
    console.log('=== Usuarios (Control DB) ===');
    console.table(filtered);

    console.log('');
    console.log('=== Tenant DBs Detectadas ===');
    console.table(tenantDbs);

    for (const user of filtered) {
      const tenantDb = user.tenant_db_name;
      console.log('');
      console.log(`=== Tenant ${tenantDb} (${user.email}) ===`);

      const [[summary]] = await pool.query(
        `
          SELECT
            (SELECT COUNT(*) FROM \`${tenantDb}\`.customers) AS customers,
            (SELECT COUNT(*) FROM \`${tenantDb}\`.services) AS services,
            (SELECT COUNT(*) FROM \`${tenantDb}\`.staff) AS staff,
            (SELECT COUNT(*) FROM \`${tenantDb}\`.appointments) AS appointments,
            (SELECT COUNT(*) FROM \`${tenantDb}\`.module_overrides) AS moduleOverrides
        `
      );

      console.table([summary]);

      const [appointments] = await pool.query(
        `
          SELECT a.id, a.status, a.start_at, c.full_name AS cliente, s.name AS servicio
          FROM \`${tenantDb}\`.appointments a
          JOIN \`${tenantDb}\`.customers c ON c.id = a.customer_id
          JOIN \`${tenantDb}\`.services s ON s.id = a.service_id
          ORDER BY a.start_at DESC
          LIMIT 10
        `
      );

      if (appointments.length === 0) {
        console.log('Sin citas registradas.');
      } else {
        console.log('Ultimas 10 citas:');
        console.table(appointments);
      }

      if (showDetails) {
        const [customers] = await pool.query(
          `
            SELECT id, full_name, phone, email, created_at
            FROM \`${tenantDb}\`.customers
            ORDER BY created_at DESC
            LIMIT 20
          `
        );

        console.log('Ultimos 20 clientes:');
        if (customers.length === 0) {
          console.log('Sin clientes registrados.');
        } else {
          console.table(customers);
        }
      }
    }
  } finally {
    await pool.end();
  }
}

function readArg(name) {
  const exact = args.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1).trim();

  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) return String(args[index + 1]).trim();

  return null;
}

main().catch((error) => {
  console.error('Error inspeccionando MySQL.');
  console.error(error.message || error);
  process.exit(1);
});
