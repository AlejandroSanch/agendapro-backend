import { MigrationContext } from '../../migrator';
import { randomUUID } from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export async function up({ context }: { context: MigrationContext }): Promise<void> {
  const db = context.connection;

  // 1. Actualizar índice único para incluir 'type'
  // Primero intentamos borrar el índice anterior si existe
  try {
    await db.query('ALTER TABLE categories DROP INDEX idx_category_name_unique');
  } catch (e) {
    // Si no existe, lo ignoramos
  }

  // Añadimos el nuevo índice compuesto
  try {
    await db.query('ALTER TABLE categories ADD UNIQUE INDEX idx_category_name_type_unique (name, type)');
  } catch (e) {
    // Si ya existe, lo ignoramos
  }

  // Obtener todas las categorías
  const [categories] = await db.query<RowDataPacket[]>('SELECT id, name, description FROM categories');

  for (const cat of categories) {
    const catId = cat.id;

    // Chequear servicios
    const [services] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM services WHERE category_id = ?', [catId]);
    const hasServices = Number(services[0]?.total ?? 0) > 0;

    // Chequear productos
    const [products] = await db.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM products WHERE category_id = ?', [catId]);
    const hasProducts = Number(products[0]?.total ?? 0) > 0;

    if (hasServices && hasProducts) {
      // Categoría compartida: Dejar la original para servicios, y crear una copia para productos.
      await db.query('UPDATE categories SET type = ? WHERE id = ?', ['service', catId]);

      const newCatId = `cat_${randomUUID()}`;
      await db.query('INSERT INTO categories (id, name, description, type) VALUES (?, ?, ?, ?)', [newCatId, cat.name, cat.description || '', 'product']);

      // Migrar todos los productos a la nueva categoría
      await db.query('UPDATE products SET category_id = ? WHERE category_id = ?', [newCatId, catId]);
    } else if (hasServices) {
      // Solo tiene servicios
      await db.query('UPDATE categories SET type = ? WHERE id = ?', ['service', catId]);
    } else if (hasProducts) {
      // Solo tiene productos
      await db.query('UPDATE categories SET type = ? WHERE id = ?', ['product', catId]);
    } else {
      // Sin uso, se queda como product por defecto, no hacemos nada porque el default ya fue 'product'
      await db.query('UPDATE categories SET type = ? WHERE id = ?', ['product', catId]);
    }
  }
}

export async function down({ context }: { context: MigrationContext }): Promise<void> {
  // En caso de rollback, no podemos fácilmente revertir los IDs duplicados,
  // pero podemos simplemente dejarlos como estaban y la UI los volvería a combinar si type desaparece.
}
