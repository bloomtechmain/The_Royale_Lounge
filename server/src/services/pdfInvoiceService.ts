import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

// ─── In-memory invoice store (24h TTL) ────────────────────────────────────────
interface InvoiceEntry { buffer: Buffer; filename: string; expires: number; }
const store = new Map<string, InvoiceEntry>();

export function getStoredInvoice(token: string): InvoiceEntry | null {
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(token); return null; }
  return entry;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

function fmt(n: number | string) {
  const v = parseFloat(String(n));
  return `LKR ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── PDF Builder ──────────────────────────────────────────────────────────────
interface PDFData {
  type: 'receipt' | 'rental';
  refNumber: string; date: string; returnDate?: string;
  days?: number; eventType?: string; paymentMethod?: string; notes?: string;
  shopName: string; shopAddress?: string; shopPhone?: string;
  shopEmail?: string; shopLogoUrl?: string;
  customerName?: string; customerPhone?: string; customerEmail?: string;
  items: Array<{ name: string; qty: number; price: number; subtotal: number }>;
  subtotal: number; discount: number; tax: number;
  total: number; paid: number; change?: number; fine?: number;
}

async function buildPDF(d: PDFData): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const bufs: Buffer[] = [];
      doc.on('data', b => bufs.push(b));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      const GOLD = '#c9a96e'; const DARK = '#1a1a2e';
      const GRAY = '#777777'; const LGRAY = '#f8f8f8';
      const WHITE = '#ffffff'; const TEXT = '#1c1c2e';
      const ML = 50; const W = 495; // usable width (595 - 100)

      let y = 0;

      // ── Header band ──────────────────────────────────────────────────────────
      doc.rect(0, 0, 595, 105).fillColor(DARK).fill();
      doc.rect(0, 100, 595, 5).fillColor(GOLD).fill();

      // Logo
      let logoW = 0;
      if (d.shopLogoUrl) {
        const lb = await fetchImageBuffer(d.shopLogoUrl);
        if (lb) {
          try { doc.image(lb, ML, 22, { width: 58, height: 58 }); logoW = 70; } catch {}
        }
      }

      // Company name + contact
      const cx = ML + logoW;
      doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE).text(d.shopName, cx, 22, { width: W - logoW });
      doc.font('Helvetica').fontSize(8.5).fillColor('#b0b8c8');
      if (d.shopAddress) doc.text(d.shopAddress, cx, doc.y + 3, { width: W - logoW });
      const contact = [d.shopPhone, d.shopEmail].filter(Boolean).join('  ·  ');
      if (contact) doc.text(contact, cx, doc.y + 2, { width: W - logoW });

      // Invoice type badge (top-right of header)
      const badge = d.type === 'receipt' ? 'RECEIPT' : 'RENTAL INVOICE';
      doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD)
        .text(badge, ML, 22, { width: W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor('#8899aa')
        .text(`#${d.refNumber}`, ML, 38, { width: W, align: 'right' });

      y = 120;

      // ── Info row: invoice details | customer ─────────────────────────────────
      const half = (W - 20) / 2;

      // Invoice details box
      doc.rect(ML, y, half, 90).fillColor(LGRAY).fill();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD).text('INVOICE DETAILS', ML + 10, y + 10);
      let iy = y + 24;
      doc.font('Helvetica').fontSize(9).fillColor(TEXT);
      doc.text(d.type === 'receipt' ? `Sale #: ${d.refNumber}` : `Booking #: ${d.refNumber}`, ML + 10, iy); iy += 14;
      doc.text(`Date: ${d.date}`, ML + 10, iy); iy += 14;
      if (d.returnDate) { doc.text(`Return: ${d.returnDate}`, ML + 10, iy); iy += 14; }
      if (d.days) { doc.text(`Duration: ${d.days} day(s)`, ML + 10, iy); iy += 14; }
      if (d.eventType) doc.text(`Event: ${d.eventType}`, ML + 10, iy);

      // Customer details box
      const rx = ML + half + 20;
      doc.rect(rx, y, half, 90).fillColor(LGRAY).fill();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD).text('BILLED TO', rx + 10, y + 10);
      let cy2 = y + 24;
      doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT)
        .text(d.customerName || 'Walk-in Customer', rx + 10, cy2, { width: half - 20 }); cy2 += 16;
      doc.font('Helvetica').fontSize(9).fillColor(GRAY);
      if (d.customerPhone) { doc.text(d.customerPhone, rx + 10, cy2, { width: half - 20 }); cy2 += 13; }
      if (d.customerEmail) doc.text(d.customerEmail, rx + 10, cy2, { width: half - 20 });

      y += 105;

      // ── Items table ───────────────────────────────────────────────────────────
      // Cols: Item (220), Qty (40), Unit Price (85), Subtotal (100)
      const C0 = ML, C1 = ML + 225, C2 = ML + 270, C3 = ML + 360, C4 = ML + 450;
      const CW = [220, 40, 85, 85, 60];

      // Header
      doc.rect(ML, y, W, 22).fillColor(DARK).fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(WHITE);
      doc.text('ITEM',       C0 + 8, y + 7, { width: CW[0] - 8 });
      doc.text('QTY',        C1,     y + 7, { width: CW[1], align: 'center' });
      doc.text('UNIT PRICE', C2,     y + 7, { width: CW[2], align: 'right' });
      doc.text('PRICE/DAY',  C3,     y + 7, { width: CW[3], align: 'right' });
      doc.text('TOTAL',      C4,     y + 7, { width: CW[4] - 5, align: 'right' });
      y += 22;

      if (d.type === 'receipt') {
        // For receipts, show Item | Qty | Unit Price | Total (skip price/day col)
        doc.rect(ML, y - 22, W, 22).fillColor(DARK).fill();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(WHITE);
        doc.text('ITEM',       C0 + 8, y - 15, { width: CW[0] - 8 });
        doc.text('QTY',        C1,     y - 15, { width: CW[1], align: 'center' });
        doc.text('UNIT PRICE', C2,     y - 15, { width: CW[2] + CW[3], align: 'right' });
        doc.text('TOTAL',      C4,     y - 15, { width: CW[4] - 5, align: 'right' });
      }

      d.items.forEach((item, i) => {
        const rh = 20;
        doc.rect(ML, y, W, rh).fillColor(i % 2 === 0 ? WHITE : LGRAY).fill();
        doc.font('Helvetica').fontSize(9).fillColor(TEXT);

        // Truncate long names
        const nameStr = item.name.length > 36 ? item.name.slice(0, 34) + '…' : item.name;
        doc.text(nameStr, C0 + 8, y + 5, { width: CW[0] - 8, lineBreak: false });
        doc.text(String(item.qty), C1, y + 5, { width: CW[1], align: 'center', lineBreak: false });

        if (d.type === 'receipt') {
          doc.text(fmt(item.price), C2, y + 5, { width: CW[2] + CW[3], align: 'right', lineBreak: false });
        } else {
          doc.text(fmt(item.price) + '/day', C2, y + 5, { width: CW[2] + CW[3], align: 'right', lineBreak: false });
        }
        doc.text(fmt(item.subtotal), C4, y + 5, { width: CW[4] - 5, align: 'right', lineBreak: false });
        y += rh;
      });

      // Outer border for table
      doc.rect(ML, y - d.items.length * 20 - 22, W, d.items.length * 20 + 22)
        .strokeColor('#d0d0d0').lineWidth(0.5).stroke();

      y += 12;

      // ── Totals block ──────────────────────────────────────────────────────────
      const TLX = 595 - ML - 225; // left edge of totals block
      const LW = 120; const VW = 100;

      function tRow(label: string, value: string, bold = false, bgColor?: string, fgColor = TEXT) {
        if (bgColor) doc.rect(TLX - 5, y - 2, LW + VW + 5, 20).fillColor(bgColor).fill();
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(fgColor);
        doc.text(label, TLX, y, { width: LW, align: 'right', lineBreak: false });
        doc.text(value, TLX + LW, y, { width: VW, align: 'right', lineBreak: false });
        y += 18;
      }

      if (d.discount > 0) tRow('Discount:', `-${fmt(d.discount)}`, false, undefined, '#27ae60');
      if (d.tax > 0) tRow('Tax:', fmt(d.tax));
      tRow('TOTAL', fmt(d.total), true, DARK, GOLD);
      if (d.paid > 0) tRow('Paid:', fmt(d.paid));
      if (d.change && d.change > 0) tRow('Change:', fmt(d.change));
      if (d.fine && d.fine > 0) tRow('Late Fine:', fmt(d.fine), false, '#fdecea', '#c0392b');
      if (d.paymentMethod) tRow('Payment:', d.paymentMethod);

      y += 10;

      // Notes
      if (d.notes) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text('NOTES', ML, y); y += 12;
        doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(d.notes, ML, y, { width: W }); y += 20;
      }

      // ── Footer ────────────────────────────────────────────────────────────────
      doc.rect(0, 790, 595, 52).fillColor(DARK).fill();
      doc.rect(0, 790, 595, 3).fillColor(GOLD).fill();
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#aaaaaa')
        .text('Thank you for doing business with us! We appreciate your trust and loyalty.', ML, 802, { width: W, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD)
        .text(d.shopName, ML, 818, { width: W, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

// ─── Shop settings helper ─────────────────────────────────────────────────────
async function getShopSettings() {
  const res = await db.query(`
    SELECT key, value FROM settings
    WHERE key IN ('shop_name','shop_address','shop_phone','shop_email','shop_logo')
  `);
  const m: Record<string, string> = {};
  for (const r of res.rows) m[r.key] = r.value;
  return {
    shopName:    m['shop_name']    || 'The Royale Lounge',
    shopAddress: m['shop_address'] || '',
    shopPhone:   m['shop_phone']   || '',
    shopEmail:   m['shop_email']   || '',
    shopLogoUrl: m['shop_logo']    || '',
  };
}

// ─── Public generators ────────────────────────────────────────────────────────
export async function generatePOSInvoicePDF(saleId: string): Promise<string> {
  const shop = await getShopSettings();

  const res = await db.query(`
    SELECT s.sale_number, s.subtotal, s.discount_amount, s.tax_amount,
           s.total_amount, s.amount_paid, s.change_amount, s.payment_method,
           s.created_at, s.notes,
           c.name  AS customer_name,
           c.phone AS customer_phone,
           c.email AS customer_email,
           si.product_name, si.variant_info, si.quantity,
           si.unit_price, si.subtotal AS item_subtotal
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    JOIN  sale_items si   ON si.sale_id = s.id
    WHERE s.id = $1
  `, [saleId]);

  if (!res.rows.length) throw new Error('Sale not found');
  const r0 = res.rows[0];
  const PAY: Record<string, string> = {
    cash: 'Cash', card: 'Card',
    mobile_payment: 'Mobile Pay', bank_transfer: 'Bank Transfer', mixed: 'Mixed',
  };

  const buffer = await buildPDF({
    type: 'receipt',
    refNumber: r0.sale_number,
    date: new Date(r0.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    paymentMethod: PAY[r0.payment_method] || r0.payment_method,
    notes: r0.notes || '',
    ...shop,
    customerName:  r0.customer_name,
    customerPhone: r0.customer_phone,
    customerEmail: r0.customer_email,
    items: res.rows.map(row => ({
      name:     row.product_name + (row.variant_info ? ` (${row.variant_info})` : ''),
      qty:      row.quantity,
      price:    parseFloat(row.unit_price),
      subtotal: parseFloat(row.item_subtotal),
    })),
    subtotal: parseFloat(r0.subtotal),
    discount: parseFloat(r0.discount_amount || '0'),
    tax:      parseFloat(r0.tax_amount || '0'),
    total:    parseFloat(r0.total_amount),
    paid:     parseFloat(r0.amount_paid),
    change:   parseFloat(r0.change_amount || '0'),
  });

  const token = uuidv4();
  store.set(token, {
    buffer,
    filename: `Receipt_${r0.sale_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

export async function generateRentalInvoicePDF(rentalId: string): Promise<string> {
  const shop = await getShopSettings();

  const res = await db.query(`
    SELECT r.booking_number, r.rental_start_date, r.rental_end_date,
           r.total_rental_cost, r.discount_amount, r.advance_payment,
           r.total_fine, r.event_type, r.notes,
           c.name  AS customer_name,
           c.phone AS customer_phone,
           c.email AS customer_email,
           p.name  AS product_name,
           pv.size, pv.color,
           ri.quantity, ri.rental_price_per_day
    FROM rentals r
    JOIN  customers c       ON c.id  = r.customer_id
    LEFT JOIN rental_items ri        ON ri.rental_id = r.id
    LEFT JOIN product_variants pv    ON pv.id = ri.product_variant_id
    LEFT JOIN products p             ON p.id  = pv.product_id
    WHERE r.id = $1
  `, [rentalId]);

  if (!res.rows.length) throw new Error('Rental not found');
  const r0 = res.rows[0];
  const start = new Date(r0.rental_start_date);
  const end   = new Date(r0.rental_end_date);
  const days  = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const fmtD  = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const buffer = await buildPDF({
    type: 'rental',
    refNumber: r0.booking_number,
    date:       fmtD(start),
    returnDate: fmtD(end),
    days,
    eventType: r0.event_type || '',
    notes:     r0.notes || '',
    ...shop,
    customerName:  r0.customer_name,
    customerPhone: r0.customer_phone,
    customerEmail: r0.customer_email,
    items: res.rows.filter(row => row.product_name).map(row => {
      const variant = [row.size, row.color].filter(Boolean).join('/');
      return {
        name:     row.product_name + (variant ? ` (${variant})` : ''),
        qty:      row.quantity,
        price:    parseFloat(row.rental_price_per_day),
        subtotal: parseFloat(row.rental_price_per_day) * row.quantity * days,
      };
    }),
    subtotal: parseFloat(r0.total_rental_cost),
    discount: parseFloat(r0.discount_amount || '0'),
    tax:      0,
    total:    parseFloat(r0.total_rental_cost) - parseFloat(r0.discount_amount || '0'),
    paid:     parseFloat(r0.advance_payment || '0'),
    fine:     parseFloat(r0.total_fine || '0'),
  });

  const token = uuidv4();
  store.set(token, {
    buffer,
    filename: `Invoice_${r0.booking_number.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}
