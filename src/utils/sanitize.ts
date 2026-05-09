/**
 * Limpia nombres de entidades que fueron soft-deleted.
 * Remueve el prefijo "[BORRADO]" y el sufijo numérico "(123456)" que se agrega
 * durante el borrado lógico para liberar la restricción UNIQUE del nombre.
 */
export function cleanDeletedName(name: string): string {
  return name
    .replace(/^\[BORRADO\]\s+/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
}
