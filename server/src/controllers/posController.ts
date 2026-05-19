import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { generateSaleNumber } from '../utils/generateSKU';

export async function checkout(req: AuthRequest, res: Response): Promise<void> {
  const {
    customerId,
    items,
    discountAmount = 0,
    taxRate = 0,
    paymentMethod = 'cash',
    amountPaid,
    notes,
  } = req.body;

  if (!items?.length) {
    res.status(400).json({ error: 'Cart is empty' });
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Generate sale number
    const countRes = await client.query(`SELECT COUNT(*) FROM sales`);
    const seq = parseInt(countRes.rows[0].count) + 1;
    const saleNumber = generateSaleNumber(seq);

    // Calculate totals
    let subtotal = 0;
    const itemDetails: any[] = [];

    for (const item of items) {
      const varRes = await client.query(`
        SELECT pv.*, p.name as product_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = $1
      `, [item.variantId]);

      if (!varRes.rows[0]) throw new Error(`Product variant ${item.variantId} not found`);
      const variant = varRes.rows[0];

      const price = item.unitPrice || variant.selling_price || 0;
      const itemDiscount = item.discount || 0;
      const itemSubtotal = (price - itemDiscount) * item.quantity;
      subtotal += itemSubtotal;

      itemDetails.push({
        variantId: item.variantId,
        productName: variant.product_name,
        variantInfo: [variant.size, variant.color].filter(Boolean).join(' / '),
        quantity: item.quantity,
        unitPrice: price,
        discount: itemDiscount,
        itemSubtotal,
        stockQty: variant.stock_quantity,
      });
    }

    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal - discountAmount + taxAmount;
    const changeAmount = Math.max(0, (amountPaid || totalAmount) - totalAmount);

    const saleRes = await client.query(`
      INSERT INTO sales (
        sale_number, customer_id, subtotal, discount_amount, tax_amount,
        total_amount, amount_paid, change_amount, payment_method, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      saleNumber, customerId || null, subtotal, discountAmount, taxAmount,
      totalAmount, amountPaid || totalAmount, changeAmount,
      paymentMethod, notes || null, req.user?.id,
    ]);

    const sale = saleRes.rows[0];

    // Insert sale items and update stock
    for (const item of itemDetails) {
      await client.query(`
        INSERT INTO sale_items (sale_id, product_variant_id, product_name, variant_info, quantity, unit_price, discount, subtotal)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [sale.id, item.variantId, item.productName, item.variantInfo, item.quantity, item.unitPrice, item.discount, item.itemSubtotal]);

      // Reduce stock — only from the "for sale" portion
      const stockRes = await client.query(`
        UPDATE product_variants
        SET stock_quantity = stock_quantity - $1,
            updated_at = NOW()
        WHERE id = $2 AND (stock_quantity - available_for_rent) >= $1
        RETURNING id
      `, [item.quantity, item.variantId]);
      if (stockRes.rowCount === 0) {
        throw new Error(`Insufficient sale stock for "${item.productName}". Some units may be reserved for rentals.`);
      }

      // Record inventory movement
      await client.query(`
        INSERT INTO inventory_movements (product_variant_id, type, quantity, reason, reference_id, reference_type, created_by)
        VALUES ($1, 'out', $2, 'POS Sale', $3, 'sale', $4)
      `, [item.variantId, item.quantity, sale.id, req.user?.id]);
    }

    // Record payment
    await client.query(`
      INSERT INTO payments (sale_id, amount, payment_method, payment_type, created_by)
      VALUES ($1, $2, $3, 'full', $4)
    `, [sale.id, amountPaid || totalAmount, paymentMethod, req.user?.id]);

    await client.query('COMMIT');

    // Get full sale with items for receipt
    const fullSaleRes = await client.query(`
      SELECT s.*, si.*, pv.size, pv.color
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      JOIN product_variants pv ON pv.id = si.product_variant_id
      WHERE s.id = $1
    `, [sale.id]);

    res.status(201).json({
      sale,
      items: itemDetails,
      receipt: {
        saleNumber,
        items: itemDetails,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        amountPaid: amountPaid || totalAmount,
        changeAmount,
        paymentMethod,
      },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

export async function getSales(req: Request, res: Response): Promise<void> {
  const { fromDate, toDate } = req.query;
  let whereClause = 'WHERE s.status != \'cancelled\'';
  const params: any[] = [];
  let pi = 1;

  if (fromDate) {
    whereClause += ` AND DATE(s.created_at) >= $${pi++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND DATE(s.created_at) <= $${pi++}`;
    params.push(toDate);
  }

  const result = await db.query(`
    SELECT s.*,
           c.name as customer_name,
           u.name as cashier_name,
           COUNT(si.id) as item_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN sale_items si ON si.sale_id = s.id
    ${whereClause}
    GROUP BY s.id, c.name, u.name
    ORDER BY s.created_at DESC
    LIMIT 50
  `, params);

  res.json(result.rows);
}

export async function getSaleById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const saleRes = await db.query(`
    SELECT s.*, c.name as customer_name, u.name as cashier_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.id = $1
  `, [id]);

  if (!saleRes.rows[0]) {
    res.status(404).json({ error: 'Sale not found' });
    return;
  }

  const itemsRes = await db.query(`
    SELECT si.*, p.name as product_name, pv.size, pv.color, pv.sku as variant_sku,
           pi.url as product_image
    FROM sale_items si
    JOIN product_variants pv ON pv.id = si.product_variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
    WHERE si.sale_id = $1
  `, [id]);

  res.json({ ...saleRes.rows[0], items: itemsRes.rows });
}
