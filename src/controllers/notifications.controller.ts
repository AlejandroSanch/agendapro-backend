import { Request, Response } from 'express';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { tenantDbNameFromUserId } from '../data/utils';
import { 
  listSystemNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteNotification
} from '../data/repositories/notification.repository';

export const NotificationsController = {
  /**
   * Obtiene la lista de notificaciones del sistema.
   */
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const tenantDb = tenantDbNameFromUserId(req.user.id);
    const notifications = await listSystemNotifications(tenantDb);
    res.json({ notifications });
  }),

  /**
   * Marca una notificación específica como leída.
   */
  markAsRead: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = req.params;

    const tenantDb = tenantDbNameFromUserId(req.user.id);
    const success = await markNotificationAsRead(tenantDb, id);
    if (!success) throw new ApiError(404, 'Notificación no encontrada.');

    res.json({ success: true });
  }),

  /**
   * Marca todas las notificaciones como leídas.
   */
  markAllRead: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const tenantDb = tenantDbNameFromUserId(req.user.id);
    await markAllNotificationsAsRead(tenantDb);
    res.json({ success: true });
  }),

  /**
   * Elimina una notificación.
   */
  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = req.params;

    const tenantDb = tenantDbNameFromUserId(req.user.id);
    const success = await deleteNotification(tenantDb, id);
    if (!success) throw new ApiError(404, 'Notificación no encontrada.');

    res.json({ success: true });
  })
};
