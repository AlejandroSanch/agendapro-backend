import { z } from 'zod';

export const checkoutItemSchema = z.object({
  tipo: z.enum(['service', 'product']),
  id: z.string().min(1, 'ID de ítem requerido'),
  cantidad: z.number().int().min(1, 'Cantidad mínima 1'),
  precioUnitario: z.number().min(0, 'Precio unitario inválido'),
});

export const checkoutPaymentSchema = z.object({
  metodo: z.enum(['cash', 'card', 'transfer', 'loyalty_points']),
  monto: z.number().min(0, 'Monto inválido'),
});

export const checkoutSchema = z.object({
  clienteId: z.string().min(1, 'ID de cliente requerido'),
  citaId: z.string().optional(),
  items: z.array(checkoutItemSchema).min(1, 'Debe haber al menos un ítem'),
  pagos: z.array(checkoutPaymentSchema).min(1, 'Debe haber al menos un pago'),
});
