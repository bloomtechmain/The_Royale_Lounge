import { Router, Request, Response } from 'express';
import { getStoredInvoice } from '../services/pdfInvoiceService';

const router = Router();

// Public — no auth required so wa.me links work without login
router.get('/download/:token', (req: Request, res: Response) => {
  const entry = getStoredInvoice(req.params.token);
  if (!entry) {
    res.status(404).send('<h2>Invoice not found or expired</h2><p>Links are valid for 24 hours.</p>');
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${entry.filename}"`);
  res.setHeader('Content-Length', entry.buffer.length);
  res.send(entry.buffer);
});

export default router;
