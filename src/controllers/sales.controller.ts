import { Request, Response } from 'express';
import { createSale } from '../data/repositories/sale.repository';
import { checkoutSchema } from '../validators/sales.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

export const SalesController = {
  checkout: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = checkoutSchema.parse(req.body);
    
    const payload = {
      customerId: data.clienteId,
      appointmentId: data.citaId,
      items: data.items.map(item => ({
        type: item.tipo,
        id: item.id,
        quantity: item.cantidad,
        unitPriceCents: Math.round(item.precioUnitario * 100),
      })),
      payments: data.pagos.map(payment => ({
        method: payment.metodo,
        amountCents: Math.round(payment.monto * 100),
      })),
    };

    try {
      const saleId = await createSale(req.user.id, payload);
      if (!saleId) throw new ApiError(500, 'No se pudo procesar la venta.');
      
      res.status(201).json({ 
        ok: true, 
        saleId,
        message: 'Checkout completado con éxito.'
      });
    } catch (error) {
      console.error('Checkout error:', error);
      throw new ApiError(500, 'Error interno al procesar el checkout.');
    }
  }),
};
