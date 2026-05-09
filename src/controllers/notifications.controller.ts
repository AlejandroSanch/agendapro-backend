import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getAuthUser } from '../utils/request';
import { tenantDbNameFromUserId } from '../data/utils';
import { 
  listSystemNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification
} from '../data/repositories/notification.repository';

const idParamSchema = z.object({
  id: z.string().min(1)
});

export const NotificationsController = {
  /**
   * Obtiene la lista de notificaciones del sistema.
   */
  list: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    
    const tenantDb = tenantDbNameFromUserId(user.id);
    const notifications = await listSystemNotifications(tenantDb);
    res.json({ notifications });
  }),

  /**
   * Marca una notificación específica como leída.
   */
  markAsRead: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const { id } = idParamSchema.parse(req.params);

    const tenantDb = tenantDbNameFromUserId(user.id);
    const success = await markNotificationAsRead(tenantDb, id);
    if (!success) throw new ApiError(404, 'Notificación no encontrada.');

    res.json({ success: true });
  }),

  /**
   * Marca todas las notificaciones como leídas.
   */
  markAllRead: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);

    const tenantDb = tenantDbNameFromUserId(user.id);
    await markAllNotificationsAsRead(tenantDb);
    res.json({ success: true });
  }),

  /**
   * Elimina una notificación.
   */
  delete: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const { id } = idParamSchema.parse(req.params);

    const tenantDb = tenantDbNameFromUserId(user.id);
    const success = await deleteNotification(tenantDb, id);
    if (!success) throw new ApiError(404, 'Notificación no encontrada.');

    res.json({ success: true });
  })
};
