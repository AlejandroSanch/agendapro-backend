import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { getAuthUser } from '../utils/request';
import {
  createStaffBlock,
  deleteStaffBlock,
  listStaffBlocks,
} from '../data/repositories/staff-block.repository';

export const getBlocks = asyncWrapper(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const { staffId, dateFrom, dateTo } = req.query;

  const blocks = await listStaffBlocks(user.id, {
    staffId: staffId ? Number(staffId) : undefined,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string,
  });

  res.json(blocks);
});

export const createBlock = asyncWrapper(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const { staffId, title, startAt, endAt } = req.body;

  const block = await createStaffBlock(user.id, {
    staffId: Number(staffId),
    title,
    startAt,
    endAt,
  });

  res.status(201).json(block);
});

export const deleteBlock = asyncWrapper(async (req: Request, res: Response) => {
  const user = getAuthUser(req);
  const { id } = req.params;

  const success = await deleteStaffBlock(user.id, Number(id));
  if (!success) {
    return res.status(404).json({ message: 'Bloqueo no encontrado' });
  }

  res.status(204).send();
});
