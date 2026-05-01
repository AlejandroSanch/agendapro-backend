import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Todas las rutas de notificaciones requieren autenticación
router.use(requireAuth);

router.get('/', NotificationsController.list);
router.patch('/:id/read', NotificationsController.markAsRead);
router.delete('/:id', NotificationsController.delete);
router.post('/read-all', NotificationsController.markAllRead);

export { router as notificationsRouter };
