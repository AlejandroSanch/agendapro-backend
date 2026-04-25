import { Request, Response } from 'express';
import {
  createProduct,
  listProducts,
  ProductRecord,
  updateProduct,
} from '../data/repositories/product.repository';
import { createProductSchema, productIdParamSchema, updateProductSchema } from '../validators/products.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

function toApiProduct(product: ProductRecord) {
  return {
    id: product.id,
    nombre: product.name,
    sku: product.sku,
    precio: product.priceCents / 100,
    costo: product.costCents / 100,
    stock: product.stockQuantity,
    alertaStock: product.reorderAlertLevel,
    activo: product.isActive,
    proveedorId: product.supplierId,
  };
}

export const ProductsController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const products = await listProducts(req.user.id);
    res.json({ products: products.map(toApiProduct) });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createProductSchema.parse(req.body);
    
    const payload = {
      name: data.nombre,
      sku: data.sku,
      priceCents: Math.round(data.precio * 100),
      costCents: Math.round((data.costo || 0) * 100),
      stockQuantity: data.stock,
      reorderAlertLevel: data.alertaStock,
      isActive: data.activo,
      supplierId: data.proveedorId,
    };

    const created = await createProduct(req.user.id, payload);
    if (!created) throw new ApiError(404, 'Usuario no encontrado.');
    res.status(201).json({ product: toApiProduct(created) });
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = productIdParamSchema.parse(req.params);
    const data = updateProductSchema.parse(req.body);

    const payload: any = {};
    if (data.nombre !== undefined) payload.name = data.nombre;
    if (data.sku !== undefined) payload.sku = data.sku;
    if (data.precio !== undefined) payload.priceCents = Math.round(data.precio * 100);
    if (data.costo !== undefined) payload.costCents = Math.round(data.costo * 100);
    if (data.stock !== undefined) payload.stockQuantity = data.stock;
    if (data.alertaStock !== undefined) payload.reorderAlertLevel = data.alertaStock;
    if (data.activo !== undefined) payload.isActive = data.activo;
    if (data.proveedorId !== undefined) payload.supplierId = data.proveedorId;

    const updated = await updateProduct(req.user.id, params.id, payload);
    if (!updated) throw new ApiError(404, 'Producto no encontrado.');
    res.json({ product: toApiProduct(updated) });
  }),
};
