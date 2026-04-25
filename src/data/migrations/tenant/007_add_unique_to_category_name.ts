import { MigrationContext } from '../../migrator';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  // 1. Añadir el índice UNIQUE a la columna 'name' de la tabla 'categories'
  // Nota: Si ya existen duplicados, esto fallará, por lo que primero deberíamos limpiar.
  // Sin embargo, en un entorno multi-tenant controlado, es mejor limpiar manualmente 
  // o hacer un script de limpieza previo.
  
  // Script de limpieza: Mover servicios a la categoría con ID más bajo para el mismo nombre
  await db.query(`
    UPDATE services s
    JOIN (
      SELECT name, MIN(id) as min_id
      FROM categories
      GROUP BY name
      HAVING COUNT(*) > 1
    ) as duplicates ON s.category_id IN (
      SELECT id FROM categories WHERE name = duplicates.name AND id != duplicates.min_id
    )
    SET s.category_id = duplicates.min_id
  `);

  // Borrar categorías duplicadas (que ya no tienen servicios asociados)
  await db.query(`
    DELETE c1 FROM categories c1
    INNER JOIN categories c2 
    WHERE c1.id > c2.id AND c1.name = c2.name
  `);

  // Ahora sí, añadir el índice UNIQUE
  await db.query(`ALTER TABLE categories ADD UNIQUE INDEX idx_category_name_unique (name)`);
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;
  await db.query(`ALTER TABLE categories DROP INDEX idx_category_name_unique`);
}
