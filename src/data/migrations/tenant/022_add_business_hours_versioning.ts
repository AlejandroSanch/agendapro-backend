import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Eliminar la clave única antigua uniq_day_of_week
  await db.query(`
    ALTER TABLE business_hours
    DROP INDEX uniq_day_of_week;
  `);

  // 2. Agregar columnas effective_from y effective_to
  await db.query(`
    ALTER TABLE business_hours
    ADD COLUMN effective_from DATE NOT NULL DEFAULT '2000-01-01',
    ADD COLUMN effective_to DATE NULL;
  `);

  // 3. Crear el nuevo índice único compuesto
  await db.query(`
    ALTER TABLE business_hours
    ADD UNIQUE KEY uniq_day_effective (day_of_week, effective_from);
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Eliminar el índice compuesto
  await db.query(`
    ALTER TABLE business_hours
    DROP INDEX uniq_day_effective;
  `);

  // 2. Eliminar las columnas agregadas
  await db.query(`
    ALTER TABLE business_hours
    DROP COLUMN effective_from,
    DROP COLUMN effective_to;
  `);

  // 3. Recrear el índice único original
  await db.query(`
    ALTER TABLE business_hours
    ADD UNIQUE KEY uniq_day_of_week (day_of_week);
  `);
}
