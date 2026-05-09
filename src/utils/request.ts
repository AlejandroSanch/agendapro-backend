import { Request } from 'express';
import { ApiError } from './ApiError';

/**
 * Extrae el usuario autenticado del request.
 * Lanza ApiError 401 si no existe — centraliza el guard que se repetía
 * en cada handler de controller.
 */
export function getAuthUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw new ApiError(401, 'No autorizado.');
  return req.user;
}
