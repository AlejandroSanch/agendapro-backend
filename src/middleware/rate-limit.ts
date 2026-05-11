import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

// Limitador Global: aplica a todas las rutas bajo /api/ para prevenir DDoS
// Máximo 500 peticiones cada 15 minutos por dirección IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 500, // Do not use 0, it blocks all requests in v7
  message: { error: 'Demasiadas peticiones al servidor. Por favor, intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador Estricto: exclusivo para /login y /register
// Máximo 10 intentos cada 15 minutos por dirección IP para detener fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 100000 : 10, // Do not use 0, it blocks all requests in v7
  message: {
    error:
      'Has superado el límite de seguridad de intentos permitidos. Intenta de nuevo en 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
