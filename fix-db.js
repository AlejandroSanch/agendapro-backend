const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD
  });

  console.log('Fixing Control DB...');
  await db.query('UPDATE ' + process.env.MYSQL_DATABASE + '.umzug_meta SET name = REPLACE(name, ".ts", ".js")');

  console.log('Fixing Tenant DBs...');
  const [users] = await db.query('SELECT tenant_db_name FROM ' + process.env.MYSQL_DATABASE + '.users WHERE tenant_db_name IS NOT NULL');
  for (const u of users) {
    try {
      await db.query('UPDATE `' + u.tenant_db_name + '`.umzug_meta SET name = REPLACE(name, ".ts", ".js")');
    } catch(e) {
      console.log('Error on tenant', u.tenant_db_name, e.message);
    }
  }

  console.log('DB Fixed!');
  process.exit(0);
})();
