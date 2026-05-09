import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  // Manejo elegante de Validación en Zod
  if (err instanceof z.ZodError) {
    const message = err.issues?.[0]?.message || (err as any).errors?.[0]?.message || err.message;
    res.status(400).json({ error: message, code: 'VALIDATION_ERROR' });
    return;
  }

  // Manejo de nuestros errores controlados genéricos
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // Manejo de Error CORS o middlewares tempranos
  if (err.message && err.message.startsWith('CORS blocked')) {
    res.status(403).json({ error: err.message, code: 'CORS_ERROR' });
    return;
  }

  // Log interno para Errores Inesperados de Infraestructura
  logger.error(
    {
      err,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
    },
    '[Error no controlado]',
  );

  res.status(500).json({
    error: 'Error interno del servidor.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
