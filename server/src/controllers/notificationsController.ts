import { Request, Response } from 'express';
import { db } from '../config/database';
import { sendNotification, buildPOSInvoiceText, buildRentalInvoiceText, getWaLink, sendWhatsAppCloudDoc } from '../services/notificationService';
import { generatePOSInvoicePDF, generateRentalInvoicePDF, getStoredInvoice } from '../services/pdfInvoiceService';
import { isConnected, sendWADocument } from '../services/whatsappService';
import { AuthRequest } from '../middleware/auth';

// ─── FitSMS Delivery Report Webhook ─────────────────────────────────────────
export async function fitsmsWebhook(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body;
    console.log('[FitSMS Webhook] Delivery report received:', JSON.stringify(body));

    // FitSMS sends: { ruid, recipient, status, error_code, ... }
    const { ruid, recipient, status } = body;

    if (recipient && status) {
      const deliveryStatus = status === 'delivered' ? 'sent' : status === 'failed' ? 'failed' : null;
      if (deliveryStatus) {
        await db.query(
          `UPDATE notification_logs
           SET status = $1
           WHERE recipient = $2
             AND status = 'sent'
             AND created_at > NOW() - INTERVAL '24 hours'`,
          [deliveryStatus, recipient]
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[FitSMS Webhook] Error:', err.message);
    res.status(200).json({ received: true }); // Always 200 to stop FitSMS retries
  }
}

export async function getNotificationLogs(req: Request, res: Response): Promise<void> {
  try {
    const { rentalId, customerId, status, channel, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let pi = 1;

    if (rentalId) { whereClause += ` AND nl.rental_id = $${pi++}`; params.push(rentalId); }
    if (customerId) { whereClause += ` AND nl.customer_id = $${pi++}`; params.push(customerId); }
    if (status) { whereClause += ` AND nl.status = $${pi++}`; params.push(status); }
    if (channel) { whereClause += ` AND nl.channel = $${pi++}`; params.push(channel); }
    if (search) {
      whereClause += ` AND (c.name ILIKE $${pi} OR r.booking_number ILIKE $${pi} OR nl.recipient ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }

    const countRes = await db.query(
      `SELECT COUNT(*) as total FROM notification_logs nl
       LEFT JOIN customers c ON c.id = nl.customer_id
       LEFT JOIN rentals r ON r.id = nl.rental_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].total);

    const result = await db.query(`
      SELECT nl.*, c.name as customer_name, r.booking_number
      FROM notification_logs nl
      LEFT JOIN customers c ON c.id = nl.customer_id
      LEFT JOIN rentals r ON r.id = nl.rental_id
      ${whereClause}
      ORDER BY nl.created_at DESC
      LIMIT $${pi} OFFSET $${pi + 1}
    `, [...params, limitNum, offset]);

    const statsRes = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
        COUNT(*) FILTER (WHERE status = 'failed') as total_failed
      FROM notification_logs
    `);
    const s = statsRes.rows[0];

    res.json({
      data: result.rows,
      stats: {
        totalSent: parseInt(s.total_sent),
        totalPending: parseInt(s.total_pending),
        totalFailed: parseInt(s.total_failed),
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    console.error('getNotificationLogs error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function sendInvoice(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { type, referenceId, channel } = req.body;

    if (!type || !referenceId || !channel) {
      res.status(400).json({ error: 'type, referenceId, and channel are required' });
      return;
    }

    // ── Load settings ──────────────────────────────────────────────────────────
    const settingsRes = await db.query(`
      SELECT key, value FROM settings
      WHERE key IN (
        'whatsapp_mode','app_base_url',
        'whatsapp_cloud_phone_number_id','whatsapp_cloud_access_token',
        'shop_name'
      )
    `);
    const cfg: Record<string, string> = {};
    for (const r of settingsRes.rows) cfg[r.key] = r.value;
    const waMode    = cfg['whatsapp_mode'] || 'wame';
    const baseUrl   = (cfg['app_base_url'] || '').replace(/\/$/, '');
    const shopName  = cfg['shop_name'] || 'The Royale Lounge';
    const cloudId   = cfg['whatsapp_cloud_phone_number_id'] || '';
    const cloudToken= cfg['whatsapp_cloud_access_token'] || '';

    // ── Resolve customer phone ─────────────────────────────────────────────────
    let phone: string | null = null;
    let customerId: string | null = null;
    let rentalIdForLog: string | undefined;

    if (type === 'pos') {
      const r = await db.query(
        `SELECT s.customer_id, c.phone, c.whatsapp FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`, [referenceId]
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Sale not found' }); return; }
      customerId = r.rows[0].customer_id;
      phone = channel === 'whatsapp' ? (r.rows[0].whatsapp || r.rows[0].phone) : r.rows[0].phone;
    } else if (type === 'rental') {
      const r = await db.query(
        `SELECT r.customer_id, c.phone, c.whatsapp FROM rentals r
         LEFT JOIN customers c ON c.id = r.customer_id WHERE r.id = $1`, [referenceId]
      );
      if (!r.rows[0]) { res.status(404).json({ error: 'Rental not found' }); return; }
      customerId = r.rows[0].customer_id;
      phone = channel === 'whatsapp' ? (r.rows[0].whatsapp || r.rows[0].phone) : r.rows[0].phone;
      rentalIdForLog = referenceId;
    } else {
      res.status(400).json({ error: 'type must be pos or rental' }); return;
    }

    if (!phone) {
      res.status(400).json({ error: `Customer has no ${channel === 'whatsapp' ? 'WhatsApp/phone' : 'phone'} number` });
      return;
    }

    // ── Build message text ─────────────────────────────────────────────────────
    // Compact detail lines only (no emoji banner, no closing line)
    const detailText = type === 'pos'
      ? await buildPOSInvoiceText(referenceId)
      : await buildRentalInvoiceText(referenceId);

    const fullMessage =
      `We are pleased to have you as a valuable customer. ` +
      `Please find the details of your transaction.\n\n` +
      `${detailText}\n\n` +
      `Thanks for doing business with us.\n` +
      `Regards,\n${shopName}`;

    // ── WhatsApp with PDF ──────────────────────────────────────────────────────
    if (channel === 'whatsapp') {
      // Generate PDF
      const token = type === 'pos'
        ? await generatePOSInvoicePDF(referenceId)
        : await generateRentalInvoicePDF(referenceId);
      const pdfUrl = baseUrl ? `${baseUrl}/api/invoices/download/${token}` : null;

      // WhatsApp Cloud API → send PDF as document
      if (waMode === 'cloud_api' && cloudId && cloudToken && pdfUrl) {
        await sendWhatsAppCloudDoc({
          to: phone,
          documentUrl: pdfUrl,
          filename: type === 'pos' ? 'Receipt.pdf' : 'RentalInvoice.pdf',
          caption: fullMessage,
          phoneNumberId: cloudId,
          accessToken: cloudToken,
        });
        // Log it
        if (customerId) {
          await sendNotification({
            rentalId: rentalIdForLog, customerId,
            type: `${type}_invoice`, channel: 'whatsapp',
            recipient: phone, message: fullMessage,
          }).catch(() => {});
        }
        res.json({ sent: true });
        return;
      }

      // wa.me mode → return link (with PDF download link appended to message)
      const msgWithPdf = pdfUrl
        ? `${fullMessage}\n\n📄 Invoice: ${pdfUrl}`
        : fullMessage;
      const waLink = await getWaLink(phone, msgWithPdf);
      res.json({ waLink, pdfToken: token, pdfUrl });
      return;
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if (customerId) {
      await sendNotification({
        rentalId: rentalIdForLog, customerId,
        type: `${type}_invoice`, channel: 'sms',
        recipient: phone, message: fullMessage,
      });
    }
    res.json({ sent: true });
  } catch (err: any) {
    console.error('sendInvoice error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function sendManualNotification(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { customerId, rentalId, channel, type, message } = req.body;

    if (!customerId || !channel || !message) {
      res.status(400).json({ error: 'customerId, channel, and message are required' });
      return;
    }

    const customerRes = await db.query(
      `SELECT phone, whatsapp, email FROM customers WHERE id = $1`,
      [customerId]
    );

    if (!customerRes.rows[0]) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const customer = customerRes.rows[0];
    const recipient = channel === 'whatsapp' ? customer.whatsapp :
                      channel === 'sms' ? customer.phone :
                      customer.email;

    if (!recipient) {
      res.status(400).json({ error: `Customer has no ${channel} contact` });
      return;
    }

    await sendNotification({
      rentalId,
      customerId,
      type: type || 'manual',
      channel,
      recipient,
      message,
    });

    res.json({ message: 'Notification sent successfully' });
  } catch (err: any) {
    console.error('sendManualNotification error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Auto-Send WhatsApp Invoice (used by pos/returns controllers) ─────────────
export async function autoSendWAInvoice(
  type: 'pos' | 'rental',
  refId: string,
  phone: string,
  customerId: string,
): Promise<void> {
  if (!isConnected()) {
    console.log('[WA Auto] Skipped — WhatsApp not connected');
    return;
  }

  // Generate PDF
  const token = type === 'pos'
    ? await generatePOSInvoicePDF(refId)
    : await generateRentalInvoicePDF(refId);
  const entry = getStoredInvoice(token);
  if (!entry) throw new Error('PDF generation returned empty entry');

  // Build message
  const shopRes = await db.query(`SELECT value FROM settings WHERE key = 'shop_name'`);
  const shopName = shopRes.rows[0]?.value || 'The Royale Lounge';
  const detailText = type === 'pos'
    ? await buildPOSInvoiceText(refId)
    : await buildRentalInvoiceText(refId);
  const caption =
    `We are pleased to have you as a valuable customer. ` +
    `Please find the details of your transaction.\n\n` +
    `${detailText}\n\n` +
    `Thanks for doing business with us.\nRegards,\n${shopName}`;

  // Send PDF as document
  await sendWADocument(phone, entry.buffer, entry.filename, caption);

  // Log notification
  await sendNotification({
    customerId,
    rentalId: type === 'rental' ? refId : undefined,
    type: `${type}_invoice`,
    channel: 'whatsapp',
    recipient: phone,
    message: caption,
  }).catch(() => {});
}
