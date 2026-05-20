import { Request, Response } from 'express';
import { createSale } from '../data/repositories/sale.repository';
import { checkoutSchema } from '../validators/sales.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';
import { getProductById } from '../data/repositories/product.repository';
import { getServiceById } from '../data/repositories/service.repository';
import { getTenantDbNameByUserId } from '../data/repositories/user.repository';

export const SalesController = {
  checkout: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const data = checkoutSchema.parse(req.body);

    const tenantDbName = await getTenantDbNameByUserId(user.id);
    if (!tenantDbName) throw new ApiError(500, 'Error interno del servidor.');

    const validatedItems = [];
    for (const item of data.items) {
      let unitPriceCents = 0;
      if (item.tipo === 'service') {
        const svc = await getServiceById(tenantDbName, item.id);
        if (!svc) throw new ApiError(404, `Servicio no encontrado: ${item.id}`);
        unitPriceCents = svc.priceCents;
      } else {
        const prod = await getProductById(tenantDbName, item.id);
        if (!prod) throw new ApiError(404, `Producto no encontrado: ${item.id}`);
        unitPriceCents = prod.priceCents;
      }
      validatedItems.push({
        type: item.tipo,
        id: item.id,
        quantity: item.cantidad,
        unitPriceCents,
      });
    }

    const payload = {
      customerId: data.clienteId,
      appointmentId: data.citaId,
      notes: data.notas,
      discountCents: data.descuento ? Math.round(data.descuento * 100) : 0,
      items: validatedItems,
      payments: data.pagos.map((payment) => ({
        method: payment.metodo,
        amountCents: Math.round(payment.monto * 100),
      })),
    };

    const saleId = await createSale(user.id, payload);
    if (!saleId) throw new ApiError(500, 'No se pudo procesar la venta.');

    res.status(201).json({
      ok: true,
      saleId,
      message: 'Checkout completado con éxito.',
    });
  }),
};
