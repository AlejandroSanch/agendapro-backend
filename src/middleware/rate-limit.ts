import rateLimit from 'express-rate-limit';

// Limitador Global: aplica a todas las rutas bajo /api/ para prevenir DDoS
// Máximo 500 peticiones cada 15 minutos por dirección IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Demasiadas peticiones al servidor. Por favor, intenta más tarde.' },
  standardHeaders: true, 
  legacyHeaders: false,
});

// Limitador Estricto: exclusivo para /login y /register
// Máximo 10 intentos cada 15 minutos por dirección IP para detener fuerza bruta
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Has superado el límite de seguridad de intentos permitidos. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
