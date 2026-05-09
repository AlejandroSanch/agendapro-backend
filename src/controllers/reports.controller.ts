import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';
import { getTenantDbNameByUserId } from '../data/repositories/user.repository';
import { getReportStats } from '../data/repositories/report.repository';

export const getStats = asyncWrapper(async (req: Request, res: Response) => {
  const user = getAuthUser(req);

  const tenantDbName = await getTenantDbNameByUserId(user.id);
  if (!tenantDbName) throw new ApiError(404, 'Tenant no encontrado.');

  const stats = await getReportStats(tenantDbName);
  res.json(stats);
});
