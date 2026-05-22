import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getWAState,
  connectWhatsApp,
  disconnectWhatsApp,
  subscribe,
} from '../services/whatsappService';

const router = Router();

router.use(authenticate);

// GET /api/whatsapp/status
router.get('/status', (_req: Request, res: Response) => {
  res.json(getWAState());
});

// POST /api/whatsapp/connect
router.post('/connect', async (_req: Request, res: Response) => {
  try {
    await connectWhatsApp();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    await disconnectWhatsApp();
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/events  — Server-Sent Events
router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // prevent Nginx buffering
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send(getWAState()); // send initial state immediately
  const unsub = subscribe(send);

  req.on('close', () => {
    unsub();
  });
});

export default router;
