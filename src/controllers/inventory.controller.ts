import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';
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
    const user = getAuthUser(req);
    const logs = await listInventoryLogs(user.id);
    res.json({ logs });
  }),

  createMovement: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = createMovementSchema.parse(req.body);

    const result = await adjustStock(user.id, data);
    if (!result) throw new ApiError(404, 'Producto no encontrado.');

    res.status(201).json({ log: result });
  }),
};
