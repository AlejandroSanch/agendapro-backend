import { Request, Response } from 'express';
import {
  createProduct,
  deleteProduct,
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
    unidad: product.unit,
    precio: product.priceCents / 100,
    costo: product.costCents / 100,
    stock: product.stockQuantity,
    alertaStock: product.reorderAlertLevel,
    activo: product.isActive,
    proveedorId: product.supplierId,
    categoriaId: product.categoryId,
  };
}

export const ProductsController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const products = await listProducts(req.user.id);
    require('fs').appendFileSync('debug_list.log', `[${new Date().toISOString()}] User: ${req.user.id}, Count: ${products.length}\n`);
    res.json({ products: products.map(toApiProduct) });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createProductSchema.parse(req.body);
    
    const payload = {
      name: data.nombre,
      sku: data.sku,
      unit: data.unidad,
      priceCents: Math.round(data.precio * 100),
      costCents: Math.round((data.costo || 0) * 100),
      stockQuantity: data.stock,
      reorderAlertLevel: data.alertaStock,
      isActive: data.activo,
      supplierId: data.proveedorId,
      categoryId: data.categoriaId,
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
    if (data.unidad !== undefined) payload.unit = data.unidad;
    if (data.precio !== undefined) payload.priceCents = Math.round(data.precio * 100);
    if (data.costo !== undefined) payload.costCents = Math.round(data.costo * 100);
    if (data.stock !== undefined) payload.stockQuantity = data.stock;
    if (data.alertaStock !== undefined) payload.reorderAlertLevel = data.alertaStock;
    if (data.activo !== undefined) payload.isActive = data.activo;
    if (data.proveedorId !== undefined) payload.supplierId = data.proveedorId;
    if (data.categoriaId !== undefined) payload.categoryId = data.categoriaId;

    const updated = await updateProduct(req.user.id, params.id, payload);
    if (!updated) throw new ApiError(404, 'Producto no encontrado.');
    res.json({ product: toApiProduct(updated) });
  }),

  createBulk: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    // Using require here to avoid import issues for the bulk schema if it wasn't exported earlier
    const { createProductBulkSchema } = require('../validators/products.validators');
    const { createProductsBulk } = require('../data/repositories/product.repository');

    const items = createProductBulkSchema.parse(req.body);

    const inputs = items.map((data: any) => ({
      name: data.nombre,
      sku: data.sku,
      unit: data.unidad,
      priceCents: Math.round(data.precio * 100),
      costCents: Math.round((data.costo || 0) * 100),
      stockQuantity: data.stock,
      reorderAlertLevel: data.alertaStock,
      isActive: data.activo,
      supplierId: data.proveedorId,
      categoryId: data.categoriaId,
    }));

    const count = await createProductsBulk(req.user.id, inputs);
    res.status(201).json({ message: 'Productos creados exitosamente', count });
  }),
  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const params = productIdParamSchema.parse(req.params);
    const success = await deleteProduct(req.user.id, params.id);
    if (!success) throw new ApiError(404, 'Producto no encontrado.');
    res.json({ message: 'Producto eliminado correctamente.' });
  }),
};
