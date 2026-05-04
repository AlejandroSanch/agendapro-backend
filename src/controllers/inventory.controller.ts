import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { listInventoryLogs, adjustStock } from '../data/repositories/inventory.repository';
import { z } from 'zod';

const createMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(['in', 'out', 'adjustment', 'sale', 'service']),
  quantity: z.number().int(),
  notes: z.string().optional().nullable(),
  staffId: z.string().optional().nullable(),
});

export const InventoryController = {
  listLogs: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const logs = await listInventoryLogs(req.user.id);
    res.json({ logs });
  }),

  createMovement: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const data = createMovementSchema.parse(req.body);
    
    const result = await adjustStock(req.user.id, data);
    if (!result) throw new ApiError(404, 'Producto no encontrado.');
    
    res.status(201).json({ log: result });
  }),
};
