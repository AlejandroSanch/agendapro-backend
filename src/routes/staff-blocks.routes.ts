import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getBlocks, createBlock, deleteBlock } from '../controllers/staff-blocks.controller';

export const staffBlocksRouter = Router();

staffBlocksRouter.use(requireAuth);

staffBlocksRouter.get('/', getBlocks);
staffBlocksRouter.post('/', createBlock);
staffBlocksRouter.delete('/:id', deleteBlock);
