import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getPagination, paginatedResponse } from '../utils/pagination';
import { generateBookingNumber } from '../utils/generateSKU';
import {
  sendSmsAndWhatsapp,
  buildBookingConfirmationMessage,
  buildReadyForPickupMessage,
  buildPickedUpMessage,
} from '../services/notificationService';

export async function getRentals(req: Request, res: Response): Promise<void> {
  const { page, limit, offset } = getPagination(req.query);
  const { status, customerId, search, fromDate, toDate } = req.query;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let pi = 1;

  if (status) {
    const statuses = (status as string).split(',');
    whereClause += ` AND r.status = ANY($${pi++})`;
    params.push(statuses);
  }
  if (customerId) {
    whereClause += ` AND r.customer_id = $${pi++}`;
    params.push(customerId);
  }
  if (search) {
    whereClause += ` AND (r.booking_number ILIKE $${pi} OR c.name ILIKE $${pi} OR c.phone ILIKE $${pi})`;
    params.push(`%${search}%`);
    pi++;
  }
  if (fromDate) {
    whereClause += ` AND r.rental_start_date >= $${pi++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND r.rental_start_date <= $${pi++}`;
    params.push(toDate);
  }

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM rentals r JOIN customers c ON c.id = r.customer_id ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await db.query(`
    SELECT r.*,
           c.name as customer_name, c.phone as customer_phone,
           COUNT(ri.id) as item_count,
           u.name as created_by_name
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN rental_items ri ON ri.rental_id = r.id
    LEFT JOIN users u ON u.id = r.created_by
    ${whereClause}
    GROUP BY r.id, c.name, c.phone, u.name
    ORDER BY r.created_at DESC
    LIMIT $${pi} OFFSET $${pi + 1}
  `, [...params, limit, offset]);

  res.json(paginatedResponse(dataRes.rows, total, { page, limit, offset }));
}

export async function getRentalById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const rentalRes = await db.query(`
    SELECT r.*, c.name as customer_name, c.phone as customer_phone,
           c.whatsapp as customer_whatsapp, c.email as customer_email,
           u.name as created_by_name
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.id = $1
  `, [id]);

  if (!rentalRes.rows[0]) {
    res.status(404).json({ error: 'Rental not found' });
    return;
  }

  const itemsRes = await db.query(`
    SELECT ri.*,
           p.name as product_name, p.sku as product_sku,
           p.selling_price as product_selling_price,
           p.type as product_type,
           pv.size, pv.color, pv.material, pv.sku as variant_sku,
           pi.url as product_image
    FROM rental_items ri
    JOIN product_variants pv ON pv.id = ri.product_variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
    WHERE ri.rental_id = $1
  `, [id]);

  const paymentsRes = await db.query(`
    SELECT p.*, u.name as recorded_by
    FROM payments p
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.rental_id = $1
    ORDER BY p.created_at DESC
  `, [id]);

  const finesRes = await db.query(
    `SELECT * FROM fine_transactions WHERE rental_id = $1 ORDER BY created_at DESC`,
    [id]
  );

  const notifRes = await db.query(
    `SELECT * FROM notification_logs WHERE rental_id = $1 ORDER BY created_at DESC`,
    [id]
  );

  res.json({
    ...rentalRes.rows[0],
    items: itemsRes.rows,
    payments: paymentsRes.rows,
    fines: finesRes.rows,
    notifications: notifRes.rows,
  });
}

export async function createRental(req: AuthRequest, res: Response): Promise<void> {
  const {
    customerId, rentalStartDate, rentalEndDate,
    items, advancePayment,
    discountAmount, notes, eventType, paymentMethod,
    promotionId,
  } = req.body;

  if (!customerId || !rentalStartDate || !rentalEndDate || !items?.length) {
    res.status(400).json({ error: 'Customer, dates, and at least one item are required' });
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Generate booking number
    const countRes = await client.query(`SELECT COUNT(*) FROM rentals`);
    const seq = parseInt(countRes.rows[0].count) + 1;
    const bookingNumber = generateBookingNumber(seq);

    // Calculate total rental cost
    const startDate = new Date(rentalStartDate);
    const endDate = new Date(rentalEndDate);
    const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    let totalCost = 0;

    for (const item of items) {
      const variantRes = await client.query(
        `SELECT * FROM product_variants WHERE id = $1`,
        [item.variantId]
      );
      if (!variantRes.rows[0]) throw new Error(`Variant ${item.variantId} not found`);
      const variant = variantRes.rows[0];

      const pricePerDay = item.rentalPricePerDay || variant.rental_price_per_day;
      totalCost += pricePerDay * item.quantity * days;
    }

    // ── Promotion resolution ────────────────────────────────────────────────
    let promotionDiscount = 0;
    let resolvedPromotionId: string | null = null;

    if (promotionId) {
      const promoRes = await client.query(`
        SELECT * FROM promotions
        WHERE id = $1
          AND is_active = true
          AND CURRENT_DATE BETWEEN start_date AND end_date
          AND (scope = 'rental' OR scope = 'both')
          AND (max_usage_count IS NULL OR usage_count < max_usage_count)
        FOR UPDATE
      `, [promotionId]);

      if (!promoRes.rows[0]) throw new Error('Selected promotion is no longer valid.');
      const promo = promoRes.rows[0];

      if (promo.min_order_amount && totalCost < promo.min_order_amount) {
        throw new Error(`Rental total must be at least LKR ${promo.min_order_amount} for this promotion.`);
      }

      if (promo.type === 'percentage') {
        promotionDiscount = totalCost * (parseFloat(promo.percentage_value) / 100);
      } else if (promo.type === 'flat_amount') {
        promotionDiscount = Math.min(parseFloat(promo.flat_amount_value), totalCost);
      } else if (promo.type === 'buy_x_get_y') {
        const totalQty = items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
        if (totalQty >= promo.buy_quantity) {
          const cheapestDailyRate = Math.min(
            ...items.map((i: any) => parseFloat(i.rentalPricePerDay || 0))
          );
          promotionDiscount = promo.get_quantity * cheapestDailyRate * days;
        }
      } else if (promo.type === 'free_item') {
        const fvRes = await client.query(
          `SELECT rental_price_per_day FROM product_variants WHERE id = $1`,
          [promo.free_variant_id]
        );
        if (fvRes.rows[0]) {
          promotionDiscount = parseFloat(fvRes.rows[0].rental_price_per_day || '0') * days;
        }
      }

      promotionDiscount = Math.max(0, Math.min(promotionDiscount, totalCost));
      resolvedPromotionId = promotionId;

      await client.query(
        `UPDATE promotions SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1`,
        [promotionId]
      );
      await client.query(`
        UPDATE promotions SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND max_usage_count IS NOT NULL AND usage_count >= max_usage_count
      `, [promotionId]);
    }

    const totalDiscountAmount = (discountAmount || 0) + promotionDiscount;

    const rentalRes = await client.query(`
      INSERT INTO rentals (
        booking_number, customer_id, status, rental_start_date, rental_end_date,
        advance_payment, total_rental_cost, discount_amount,
        notes, event_type, created_by
      ) VALUES ($1,$2,'reserved',$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      bookingNumber, customerId, rentalStartDate, rentalEndDate,
      advancePayment || 0, totalCost,
      totalDiscountAmount, notes || null, eventType || null, req.user?.id,
    ]);

    const rental = rentalRes.rows[0];

    // Insert rental items
    for (const item of items) {
      const variantRes = await client.query(
        `SELECT * FROM product_variants WHERE id = $1`,
        [item.variantId]
      );
      const variant = variantRes.rows[0];
      const pricePerDay = item.rentalPricePerDay || variant.rental_price_per_day;

      await client.query(`
        INSERT INTO rental_items (rental_id, product_variant_id, quantity, rental_price_per_day)
        VALUES ($1, $2, $3, $4)
      `, [rental.id, item.variantId, item.quantity || 1, pricePerDay]);

      // Update stock (both total and available_for_rent)
      await client.query(`
        UPDATE product_variants
        SET available_for_rent = available_for_rent - $1,
            stock_quantity = stock_quantity - $1,
            updated_at = NOW()
        WHERE id = $2 AND available_for_rent >= $1
      `, [item.quantity || 1, item.variantId]);

      // Record inventory movement
      await client.query(`
        INSERT INTO inventory_movements (product_variant_id, type, quantity, reason, reference_id, reference_type, created_by)
        VALUES ($1, 'rental_out', $2, 'Rental booking', $3, 'rental', $4)
      `, [item.variantId, item.quantity || 1, rental.id, req.user?.id]);
    }

    // Record advance payment
    if (advancePayment > 0) {
      await client.query(`
        INSERT INTO payments (rental_id, amount, payment_method, payment_type, created_by)
        VALUES ($1, $2, $3, 'advance', $4)
      `, [rental.id, advancePayment, paymentMethod || 'cash', req.user?.id]);
    }

    // Record promotion usage
    if (resolvedPromotionId && promotionDiscount > 0) {
      await client.query(`
        INSERT INTO promotion_usages (promotion_id, rental_id, discount_amount, used_by)
        VALUES ($1, $2, $3, $4)
      `, [resolvedPromotionId, rental.id, promotionDiscount, req.user?.id]);
    }

    await client.query('COMMIT');

    // Send booking confirmation notification
    const customerRes = await db.query(`SELECT * FROM customers WHERE id = $1`, [customerId]);
    const customer = customerRes.rows[0];
    if (customer?.phone) {
      const message = buildBookingConfirmationMessage({
        customerName: customer.name,
        bookingNumber,
        startDate: rentalStartDate,
        endDate: rentalEndDate,
        totalCost,
        advancePaid: advancePayment || 0,
      });
      await sendSmsAndWhatsapp({
        rentalId: rental.id,
        customerId,
        type: 'booking_confirmed',
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        message,
      });
    }

    res.status(201).json(rental);
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

export async function updateRentalStatus(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['reserved', 'ready_for_pickup', 'picked_up', 'returned', 'late_return', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(`
      UPDATE rentals SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [status, notes, id]);

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Rental not found' });
      return;
    }

    // Restore inventory when rental is cancelled
    if (status === 'cancelled') {
      const items = await client.query(
        `SELECT product_variant_id, quantity FROM rental_items WHERE rental_id = $1 AND is_returned = false`,
        [id]
      );
      for (const item of items.rows) {
        await client.query(`
          UPDATE product_variants
          SET available_for_rent = available_for_rent + $1,
              stock_quantity = stock_quantity + $1,
              updated_at = NOW()
          WHERE id = $2
        `, [item.quantity, item.product_variant_id]);
      }
    }

    await client.query('COMMIT');

    const rental = result.rows[0];

    // Send status-change notifications
    if (status === 'ready_for_pickup' || status === 'picked_up') {
      const customerRes = await db.query(
        `SELECT * FROM customers WHERE id = $1`, [rental.customer_id]
      );
      const customer = customerRes.rows[0];

      if (customer?.phone) {
        const isReady = status === 'ready_for_pickup';
        const message = isReady
          ? buildReadyForPickupMessage({
              customerName: customer.name,
              bookingNumber: rental.booking_number,
              pickupDate: rental.rental_start_date,
            })
          : buildPickedUpMessage({
              customerName: customer.name,
              bookingNumber: rental.booking_number,
              returnDate: rental.rental_end_date,
            });

        await sendSmsAndWhatsapp({
          rentalId: rental.id,
          customerId: rental.customer_id,
          type: status,
          phone: customer.phone,
          whatsapp: customer.whatsapp,
          message,
        });
      }
    }

    res.json(rental);
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

export async function addPayment(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { amount, paymentMethod, paymentType, notes } = req.body;

  const result = await db.query(`
    INSERT INTO payments (rental_id, amount, payment_method, payment_type, notes, created_by)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [id, amount, paymentMethod || 'cash', paymentType || 'balance', notes, req.user?.id]);

  res.status(201).json(result.rows[0]);
}

export async function getUpcomingReturns(_req: Request, res: Response): Promise<void> {
  const result = await db.query(`
    SELECT r.*, c.name as customer_name, c.phone as customer_phone,
           COUNT(ri.id) as item_count,
           CURRENT_DATE - r.rental_end_date as days_overdue
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    LEFT JOIN rental_items ri ON ri.rental_id = r.id
    WHERE r.status IN ('picked_up', 'late_return')
      AND r.rental_end_date <= CURRENT_DATE + INTERVAL '3 days'
    GROUP BY r.id, c.name, c.phone
    ORDER BY r.rental_end_date ASC
    LIMIT 20
  `);
  res.json(result.rows);
}
