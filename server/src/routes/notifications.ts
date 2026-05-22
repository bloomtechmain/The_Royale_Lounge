import { Router } from 'express';
import { getNotificationLogs, sendManualNotification, sendInvoice, fitsmsWebhook } from '../controllers/notificationsController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public — FitSMS delivery report webhook (no auth)
router.post('/webhook/fitsms', fitsmsWebhook);

router.use(authenticate);
router.get('/logs', getNotificationLogs);
router.post('/send', sendManualNotification);
router.post('/send-invoice', sendInvoice);

export default router;
