import { db } from '../config/database';
import { env } from '../config/env';

export interface NotificationPayload {
  rentalId?: string;
  customerId: string;
  type: string;
  channel: 'sms' | 'whatsapp' | 'email' | 'system';
  recipient: string;
  message: string;
}

/** Always sends SMS; also sends WhatsApp if the customer has one set. */
export async function sendSmsAndWhatsapp(params: {
  rentalId?: string;
  customerId: string;
  type: string;
  phone: string;
  whatsapp?: string | null;
  message: string;
}): Promise<void> {
  const { rentalId, customerId, type, phone, whatsapp, message } = params;
  if (phone) {
    await sendNotification({ rentalId, customerId, type, channel: 'sms', recipient: phone, message });
  }
  if (whatsapp) {
    await sendNotification({ rentalId, customerId, type, channel: 'whatsapp', recipient: whatsapp, message });
  }
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const { rentalId, customerId, type, channel, recipient, message } = payload;

  // Insert log row and capture its id for accurate status updates
  const logRes = await db.query<{ id: string }>(
    `INSERT INTO notification_logs (rental_id, customer_id, type, channel, recipient, message, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id`,
    [rentalId || null, customerId, type, channel, recipient, message]
  );
  const logId = logRes.rows[0]?.id;

  try {
    let skipped = false;

    switch (channel) {
      case 'sms':
        skipped = await sendFitSMS(recipient, message, 'sms');
        break;
      case 'whatsapp':
        skipped = await sendFitSMS(recipient, message, 'whatsapp');
        break;
      case 'email':
        await sendEmail(recipient, getEmailSubject(type), message);
        break;
      case 'system':
        break;
    }

    if (logId) {
      if (skipped) {
        await db.query(
          `UPDATE notification_logs SET status = 'failed', error_message = 'Channel disabled in settings' WHERE id = $1`,
          [logId]
        );
      } else {
        await db.query(
          `UPDATE notification_logs SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [logId]
        );
      }
    }

    console.log(`[Notification] ${channel.toUpperCase()} ${skipped ? 'skipped (disabled)' : 'sent'} → ${recipient} [${type}]`);
  } catch (err: any) {
    if (logId) {
      await db.query(
        `UPDATE notification_logs SET status = 'failed', error_message = $1 WHERE id = $2`,
        [err.message, logId]
      );
    }
    console.error(`[Notification] Failed (${channel}) → ${recipient}:`, err);
  }
}

// ─── FitSMS Integration ───────────────────────────────────────────────────────

async function getFitSMSConfig(): Promise<{ apiToken: string; senderId: string; smsEnabled: boolean; whatsappEnabled: boolean }> {
  const res = await db.query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('fitsms_api_token', 'fitsms_sender_id', 'sms_enabled', 'whatsapp_enabled')`
  );
  const map: Record<string, string> = {};
  for (const row of res.rows) map[row.key] = row.value;

  return {
    apiToken:        map['fitsms_api_token']  || env.FITSMS_API_TOKEN,
    senderId:        map['fitsms_sender_id']  || env.FITSMS_SENDER_ID,
    smsEnabled:      map['sms_enabled']       !== 'false',
    whatsappEnabled: map['whatsapp_enabled']  === 'true',
  };
}

// Returns true if skipped (disabled), false if sent successfully
async function sendFitSMS(phone: string, message: string, channel: 'sms' | 'whatsapp' = 'sms'): Promise<boolean> {
  const { apiToken, senderId, smsEnabled, whatsappEnabled } = await getFitSMSConfig();

  const enabled = channel === 'whatsapp' ? whatsappEnabled : smsEnabled;
  if (!enabled) {
    console.log(`[${channel.toUpperCase()}] ${channel} disabled — skipping message to ${phone}`);
    return true;
  }

  if (!apiToken) {
    throw new Error('FitSMS API token not configured. Set it in Settings → Notifications or in FITSMS_API_TOKEN env var.');
  }

  // Normalise phone: strip spaces/dashes, convert local Sri Lanka 07x to +947x
  let recipient = phone.replace(/[\s\-]/g, '');
  if (recipient.startsWith('0')) {
    recipient = '+94' + recipient.slice(1);
  } else if (!recipient.startsWith('+')) {
    recipient = '+' + recipient;
  }
  console.log(`[SMS] Sending to normalised number: ${recipient}`);

  const response = await fetch('https://app.fitsms.lk/api/v4/sms/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      recipient,
      sender_id: senderId.substring(0, 11), // API max 11 chars
      type: 'plain',
      message,
      expiry_time: 3600,
    }),
  });

  const rawText = await response.text();
  console.log(`[SMS] FitSMS raw response (HTTP ${response.status}):`, rawText);

  if (!response.ok) {
    throw new Error(`FitSMS HTTP error: ${response.status} ${response.statusText} — ${rawText}`);
  }

  let result: any;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`FitSMS returned non-JSON response: ${rawText}`);
  }

  if (result.status !== 'success') {
    throw new Error(`FitSMS error: ${result.message || JSON.stringify(result)}`);
  }

  console.log(`[SMS] FitSMS accepted — RUID: ${result.data?.ruid}, Status: ${result.data?.status}`);
  return false;
}

// ─── Email stub ───────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // TODO: configure SMTP (Nodemailer) when email is needed
  console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}\n${body}`);
}

function getEmailSubject(type: string): string {
  const subjects: Record<string, string> = {
    booking_confirmed:    'Your Rental Booking is Confirmed',
    pickup_reminder:      'Reminder: Your Items are Ready for Pickup',
    return_reminder:      'Reminder: Return Date is Tomorrow',
    late_warning:         'Important: Your Rental is Overdue',
    payment_confirmation: 'Payment Received',
  };
  return subjects[type] || 'Notification from The Outfit Lounge';
}

// ─── Invoice Text Builders ────────────────────────────────────────────────────

async function getShopName(): Promise<string> {
  const r = await db.query(`SELECT value FROM settings WHERE key = 'shop_name'`);
  return r.rows[0]?.value || 'The Outfit Lounge';
}

export async function buildPOSInvoiceText(saleId: string): Promise<string> {
  const shop = await getShopName();
  const res = await db.query(`
    SELECT s.sale_number, s.subtotal, s.discount_amount, s.tax_amount,
           s.total_amount, s.amount_paid, s.change_amount, s.payment_method,
           s.created_at,
           si.product_name, si.variant_info, si.quantity, si.unit_price, si.discount, si.subtotal AS item_subtotal
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    WHERE s.id = $1
    ORDER BY si.rowid
  `, [saleId]).catch(async () => {
    // fallback without rowid (PostgreSQL doesn't have rowid)
    return db.query(`
      SELECT s.sale_number, s.subtotal, s.discount_amount, s.tax_amount,
             s.total_amount, s.amount_paid, s.change_amount, s.payment_method,
             s.created_at,
             si.product_name, si.variant_info, si.quantity, si.unit_price, si.discount, si.subtotal AS item_subtotal
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE s.id = $1
    `, [saleId]);
  });

  if (!res.rows.length) throw new Error('Sale not found');
  const sale = res.rows[0];
  const date = new Date(sale.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const PAY_LABELS: Record<string, string> = {
    cash: 'Cash', card: 'Card', mobile_payment: 'Mobile Pay', bank_transfer: 'Bank Transfer', mixed: 'Mixed',
  };

  let msg = `🧾 *Receipt — ${shop}*\n`;
  msg += `────────────────────\n`;
  msg += `Sale #: ${sale.sale_number}\n`;
  msg += `Date: ${date}\n\n`;
  msg += `*Items:*\n`;
  for (const row of res.rows) {
    const variant = row.variant_info ? ` (${row.variant_info})` : '';
    msg += `• ${row.product_name}${variant} ×${row.quantity}   LKR ${parseFloat(row.item_subtotal).toFixed(2)}\n`;
  }
  msg += `────────────────────\n`;
  if (parseFloat(sale.discount_amount) > 0)
    msg += `Discount:  -LKR ${parseFloat(sale.discount_amount).toFixed(2)}\n`;
  if (parseFloat(sale.tax_amount) > 0)
    msg += `Tax:        LKR ${parseFloat(sale.tax_amount).toFixed(2)}\n`;
  msg += `*Total:     LKR ${parseFloat(sale.total_amount).toFixed(2)}*\n`;
  msg += `Paid:       LKR ${parseFloat(sale.amount_paid).toFixed(2)}\n`;
  if (parseFloat(sale.change_amount) > 0)
    msg += `Change:     LKR ${parseFloat(sale.change_amount).toFixed(2)}\n`;
  msg += `Payment:    ${PAY_LABELS[sale.payment_method] || sale.payment_method}\n`;
  msg += `────────────────────\n`;
  msg += `Thank you for your purchase! 🙏`;
  return msg;
}

export async function buildRentalInvoiceText(rentalId: string): Promise<string> {
  const shop = await getShopName();
  const res = await db.query(`
    SELECT r.booking_number, r.rental_start_date, r.rental_end_date,
           r.total_rental_cost, r.discount_amount, r.advance_payment,
           r.total_fine, r.event_type, r.status,
           c.name AS customer_name,
           p.name AS product_name, pv.size, pv.color,
           ri.quantity, ri.rental_price_per_day
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN rental_items ri ON ri.rental_id = r.id
    LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE r.id = $1
  `, [rentalId]);

  if (!res.rows.length) throw new Error('Rental not found');
  const r = res.rows[0];
  const startDate = new Date(r.rental_start_date);
  const endDate   = new Date(r.rental_end_date);
  const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let msg = `📋 *Rental Invoice — ${shop}*\n`;
  msg += `────────────────────\n`;
  msg += `Booking: ${r.booking_number}\n`;
  msg += `Customer: ${r.customer_name}\n`;
  if (r.event_type) msg += `Event: ${r.event_type}\n`;
  msg += `\n*Items:*\n`;
  for (const row of res.rows) {
    if (!row.product_name) continue;
    const variant = [row.size, row.color].filter(Boolean).join('/');
    msg += `• ${row.product_name}${variant ? ` (${variant})` : ''} ×${row.quantity}\n`;
    msg += `  LKR ${parseFloat(row.rental_price_per_day).toFixed(2)}/day × ${days} days\n`;
  }
  msg += `────────────────────\n`;
  msg += `Period: ${fmt(startDate)} – ${fmt(endDate)}\n`;
  msg += `Rental Total:  LKR ${parseFloat(r.total_rental_cost).toFixed(2)}\n`;
  if (parseFloat(r.discount_amount || '0') > 0)
    msg += `Discount:     -LKR ${parseFloat(r.discount_amount).toFixed(2)}\n`;
  if (parseFloat(r.advance_payment || '0') > 0)
    msg += `Advance Paid:  LKR ${parseFloat(r.advance_payment).toFixed(2)}\n`;
  const balance = parseFloat(r.total_rental_cost) - parseFloat(r.discount_amount || '0') - parseFloat(r.advance_payment || '0');
  if (balance > 0) msg += `*Balance Due:  LKR ${balance.toFixed(2)}*\n`;
  if (parseFloat(r.total_fine || '0') > 0)
    msg += `Late Fine:     LKR ${parseFloat(r.total_fine).toFixed(2)}\n`;
  msg += `────────────────────\n`;
  msg += `Thank you for choosing ${shop}! 🙏`;
  return msg;
}

export async function getWaLink(phone: string, message: string): Promise<string> {
  const clean = phone.replace(/[\s\-()]/g, '');
  const normalised = clean.startsWith('0') ? '+94' + clean.slice(1) : clean.startsWith('+') ? clean : '+' + clean;
  return `https://wa.me/${normalised.replace('+', '')}?text=${encodeURIComponent(message)}`;
}

// ─── Message Templates ────────────────────────────────────────────────────────

const SHOP = 'The Outfit Lounge';

export function buildBookingConfirmationMessage(data: {
  customerName: string;
  bookingNumber: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  advancePaid: number;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Your rental booking #${data.bookingNumber} is confirmed!\n\n` +
    `Pickup : ${data.startDate}\n` +
    `Return : ${data.endDate}\n` +
    `Total  : LKR ${data.totalCost.toFixed(2)}\n` +
    `Advance: LKR ${data.advancePaid.toFixed(2)}\n\n` +
    `Thank you for choosing ${SHOP}!`
  );
}

export function buildReadyForPickupMessage(data: {
  customerName: string;
  bookingNumber: string;
  pickupDate: string;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Great news! Your rental items for booking #${data.bookingNumber} are ready for pickup.\n\n` +
    `Pickup date: ${data.pickupDate}\n\n` +
    `Please visit us at your convenience.\n\n${SHOP}`
  );
}

export function buildPickedUpMessage(data: {
  customerName: string;
  bookingNumber: string;
  returnDate: string;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Your rental items (#${data.bookingNumber}) have been picked up successfully.\n\n` +
    `Please return them by: ${data.returnDate}\n\n` +
    `Thank you for choosing ${SHOP}!`
  );
}

export function buildPickupReminderMessage(data: {
  customerName: string;
  bookingNumber: string;
  pickupDate: string;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Reminder: Your rental items (#${data.bookingNumber}) are ready for pickup tomorrow, ${data.pickupDate}.\n\n` +
    `Please visit us at your scheduled time.\n\n${SHOP}`
  );
}

export function buildReturnReminderMessage(data: {
  customerName: string;
  bookingNumber: string;
  returnDate: string;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Reminder: Your rental (#${data.bookingNumber}) is due for return tomorrow, ${data.returnDate}.\n\n` +
    `Please return items on time to avoid late fees.\n\n${SHOP}`
  );
}

export function buildLateReturnMessage(data: {
  customerName: string;
  bookingNumber: string;
  daysLate: number;
  fineAmount: number;
}): string {
  return (
    `Dear ${data.customerName},\n\n` +
    `Your rental #${data.bookingNumber} is ${data.daysLate} day(s) overdue.\n` +
    `Late fine: LKR ${data.fineAmount.toFixed(2)}\n\n` +
    `Please return items immediately to avoid additional charges.\n\n${SHOP}`
  );
}
