import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { calculateFine } from '../services/fineService';

export async function getPendingReturns(_req: Request, res: Response): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const result = await db.query(`
    SELECT r.*,
           c.name as customer_name, c.phone as customer_phone,
           COUNT(ri.id) as item_count,
           COUNT(ri.id) FILTER (WHERE ri.is_returned = false) as pending_items,
           GREATEST(0, CURRENT_DATE - r.rental_end_date) as days_overdue
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    JOIN rental_items ri ON ri.rental_id = r.id
    WHERE r.status IN ('picked_up', 'late_return')
    GROUP BY r.id, c.name, c.phone
    HAVING COUNT(ri.id) FILTER (WHERE ri.is_returned = false) > 0
    ORDER BY r.rental_end_date ASC
  `);

  res.json(result.rows);
}

export async function processReturn(req: AuthRequest, res: Response): Promise<void> {
  const { rentalId } = req.params;
  const { items, returnDate, paymentMethod = 'cash', collectFine = true } = req.body;

  const rentalRes = await db.query(`
    SELECT r.*, c.name as customer_name, c.whatsapp, c.phone, c.id as customer_id
    FROM rentals r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.id = $1
  `, [rentalId]);

  if (!rentalRes.rows[0]) {
    res.status(404).json({ error: 'Rental not found' });
    return;
  }

  const rental = rentalRes.rows[0];
  const actualReturn = returnDate ? new Date(returnDate) : new Date();

  // Load damage charge settings
  const dmgRows = await db.query(
    `SELECT key, value FROM settings WHERE key IN ('damage_charge_type','damage_flat_charge','damage_charge_percent')`
  );
  const dmgCfg: Record<string, string> = {};
  for (const r of dmgRows.rows) dmgCfg[r.key] = r.value;
  const dmgType    = dmgCfg['damage_charge_type']    || 'none';
  const dmgFlat    = parseFloat(dmgCfg['damage_flat_charge']    || '0');
  const dmgPercent = parseFloat(dmgCfg['damage_charge_percent'] || '0');

  // Booked rental days (used for percentage calculation)
  const rentalDays = Math.max(1, Math.ceil(
    (new Date(rental.rental_end_date).getTime() - new Date(rental.rental_start_date).getTime())
    / (1000 * 60 * 60 * 24)
  ));

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let totalFine = 0;
    let totalDamageCharge = 0;
    let damageNotes: string[] = [];

    // Process each returned item
    for (const item of items) {
      // clientCharge is only used for 'lost' items that have no selling price
      const { rentalItemId, condition, charge: clientCharge = 0, remark = '' } = item;

      await client.query(`
        UPDATE rental_items
        SET is_returned = true, return_condition = $1, returned_at = $2, damage_remark = $5
        WHERE id = $3 AND rental_id = $4
      `, [condition || 'good', actualReturn.toISOString(), rentalItemId, rentalId, remark || null]);

      // Get variant + product info
      const riRes = await client.query(`
        SELECT ri.product_variant_id, ri.quantity, ri.rental_price_per_day,
               p.selling_price, p.type AS product_type
        FROM rental_items ri
        JOIN product_variants pv ON pv.id = ri.product_variant_id
        JOIN products p ON p.id = pv.product_id
        WHERE ri.id = $1
      `, [rentalItemId]);

      if (riRes.rows[0]) {
        const { product_variant_id, quantity: itemQty, rental_price_per_day,
                selling_price, product_type } = riRes.rows[0];

        // Restore inventory
        const restoreQty = condition === 'lost' ? 0 : (itemQty || 1);
        await client.query(`
          UPDATE product_variants
          SET available_for_rent = available_for_rent + $1,
              stock_quantity = stock_quantity + $1,
              damaged_count = CASE WHEN $2 = 'damaged' THEN damaged_count + 1 ELSE damaged_count END,
              updated_at = NOW()
          WHERE id = $3
        `, [restoreQty, condition, product_variant_id]);

        await client.query(`
          INSERT INTO inventory_movements (product_variant_id, type, quantity, reason, reference_id, reference_type, created_by)
          VALUES ($1, 'rental_return', $2, $3, $4, 'rental', $5)
        `, [
          product_variant_id,
          itemQty || 1,
          condition === 'lost' ? (remark ? `Item lost: ${remark}` : 'Item lost') : condition === 'damaged' ? (remark ? `Returned damaged: ${remark}` : 'Returned damaged') : 'Rental return',
          rentalId,
          req.user?.id,
        ]);

        // --- Charge calculation (server-authoritative) ---
        let charge = 0;
        let chargeNote = '';

        if (condition === 'damaged') {
          if (clientCharge > 0) {
            // User manually set the charge — use that
            charge = clientCharge;
          } else if (dmgType === 'flat') {
            charge = dmgFlat;
          } else if (dmgType === 'percentage_of_rental') {
            const itemCost = parseFloat(rental_price_per_day) * (itemQty || 1) * rentalDays;
            charge = itemCost * (dmgPercent / 100);
          }
          chargeNote = remark ? `Damage charge: ${remark}` : 'Damage charge';
          damageNotes.push(remark ? `Item damaged: ${remark}` : 'Item damaged');
        } else if (condition === 'lost') {
          if (clientCharge > 0) {
            // User manually set the charge — use that
            charge = clientCharge;
          } else {
            const isSaleItem = product_type === 'sale' || product_type === 'both';
            if (isSaleItem && selling_price && parseFloat(selling_price) > 0) {
              charge = parseFloat(selling_price);
            }
          }
          chargeNote = 'Lost item charge';
          damageNotes.push('Item lost');
        }

        if (charge > 0) {
          await client.query(`
            INSERT INTO payments (rental_id, amount, payment_method, payment_type, notes, created_by)
            VALUES ($1, $2, $3, 'damage_charge', $4, $5)
          `, [rentalId, charge, paymentMethod, chargeNote, req.user?.id]);
          totalDamageCharge += charge;
        }
      }
    }

    // Check if all items are returned
    const pendingRes = await client.query(
      `SELECT COUNT(*) FROM rental_items WHERE rental_id = $1 AND is_returned = false`,
      [rentalId]
    );
    const allReturned = parseInt(pendingRes.rows[0].count) === 0;

    // Calculate total fine
    const fineCalc = await calculateFine(
      new Date(rental.rental_end_date),
      actualReturn,
      20
    );

    if (fineCalc.totalFine > 0 && collectFine) {
      // Check if fine record already exists
      const existingFine = await client.query(
        `SELECT id FROM fine_transactions WHERE rental_id = $1 AND is_paid = false`,
        [rentalId]
      );

      if (existingFine.rows.length === 0) {
        await client.query(`
          INSERT INTO fine_transactions (rental_id, days_late, fine_per_day, total_fine)
          VALUES ($1, $2, $3, $4)
        `, [rentalId, fineCalc.daysLate, fineCalc.finePerDay, fineCalc.totalFine]);
      }
    }

    // Update rental status
    const newStatus = allReturned ? (fineCalc.totalFine > 0 ? 'returned' : 'completed') : rental.status;

    await client.query(`
      UPDATE rentals SET
        status = $1,
        actual_return_date = $2,
        total_fine = $3,
        updated_at = NOW()
      WHERE id = $4
    `, [newStatus, actualReturn.toISOString().split('T')[0], fineCalc.totalFine, rentalId]);

    // Record fine payment if paid now
    if (fineCalc.totalFine > 0 && collectFine) {
      await client.query(`
        INSERT INTO payments (rental_id, amount, payment_method, payment_type, notes, created_by)
        VALUES ($1, $2, $3, 'fine', $4, $5)
      `, [rentalId, fineCalc.totalFine, paymentMethod, `Late return fine: ${fineCalc.daysLate} days`, req.user?.id]);

      await client.query(`
        UPDATE fine_transactions SET is_paid = true, paid_at = NOW(), paid_by = $1
        WHERE rental_id = $2 AND is_paid = false
      `, [req.user?.id, rentalId]);
    }

    await client.query('COMMIT');

    res.json({
      message: 'Return processed successfully',
      allReturned,
      fine: fineCalc,
      totalDamageCharge,
      damages: damageNotes,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

export async function getFineCalculation(req: Request, res: Response): Promise<void> {
  const { rentalId } = req.params;
  const { returnDate } = req.query;

  const rentalRes = await db.query(
    `SELECT rental_end_date FROM rentals WHERE id = $1`,
    [rentalId]
  );

  if (!rentalRes.rows[0]) {
    res.status(404).json({ error: 'Rental not found' });
    return;
  }

  const fineSettingRes = await db.query<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'default_fine_per_day'`
  );
  const finePerDay = parseFloat(fineSettingRes.rows[0]?.value || '20');

  const actualReturn = returnDate ? new Date(returnDate as string) : new Date();
  const fine = await calculateFine(
    new Date(rentalRes.rows[0].rental_end_date),
    actualReturn,
    finePerDay
  );

  res.json(fine);
}
