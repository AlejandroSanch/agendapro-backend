import { ensureControlDatabaseAndPool, getControlPool } from '../src/data/db';
import { env } from '../src/config/env';

async function remediate() {
  await ensureControlDatabaseAndPool();
  const pool = getControlPool();
  try {
    console.log('Verificando si la columna plaintext_password existe en la tabla users...');
    
    // Check if column exists
    const [rows]: any = await pool.query(
      `SELECT count(*) as total FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = 'users' AND column_name = 'plaintext_password'`,
       [env.mysqlDatabase]
    );
    
    const count = Number(rows[0]?.total || 0);
    if (count > 0) {
      console.log('Columna encontrada. Purgando datos...');
      await pool.query('UPDATE users SET plaintext_password = NULL');
      
      console.log('Eliminando la columna...');
      await pool.query('ALTER TABLE users DROP COLUMN plaintext_password');
      
      console.log('Remediación exitosa. Contraseñas planas eliminadas.');
    } else {
      console.log('La columna plaintext_password NO existe. No se requiere acción.');
    }
  } catch (error) {
    console.error('Error durante la remediación:', error);
  } finally {
    pool.end();
  }
}

remediate();
