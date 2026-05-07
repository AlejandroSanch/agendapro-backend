import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Renombrar la columna title a service_name
  await db.query(`
    ALTER TABLE appointments 
    CHANGE COLUMN title service_name VARCHAR(255) NOT NULL;
  `);

  // 2. Limpiar los datos existentes extrayendo solo el nombre del servicio
  // (Asumiendo que el formato anterior era "Servicio - Nombre Cliente")
  await db.query(`
    UPDATE appointments
    SET service_name = TRIM(SUBSTRING_INDEX(service_name, ' - ', 1))
    WHERE service_name LIKE '% - %';
  `);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Revertir el nombre de la columna a title
  await db.query(`
    ALTER TABLE appointments 
    CHANGE COLUMN service_name title VARCHAR(255) NOT NULL;
  `);

  // (Nota: los nombres de los clientes se pierden en la migración hacia abajo 
  // ya que no hay una forma segura de concatenarlos de nuevo masivamente 
  // si el ID del cliente cambió, pero se puede armar con un JOIN si se deseara).
}
