import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Manejo elegante de Validación en Zod
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: (err as any).errors[0].message });
    return;
  }

  // Manejo de nuestros errores controlados genéricos
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {})
    });
    return;
  }

  // Manejo de Error CORS o middlewares tempranos
  if (err.message && err.message.startsWith('CORS blocked')) {
    res.status(403).json({ error: err.message });
    return;
  }

  // Log interno para Errores Inesperados de Infraestructura
  console.error('[Error no controlado]', err);

  res.status(500).json({ error: 'Error interno del servidor.' });
}
