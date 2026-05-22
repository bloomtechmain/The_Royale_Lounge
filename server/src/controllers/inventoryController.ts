import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getPagination, paginatedResponse } from '../utils/pagination';

export async function getInventory(req: Request, res: Response): Promise<void> {
  const { page, limit, offset } = getPagination(req.query);
  const { search, category, lowStock } = req.query;

  let whereClause = 'WHERE p.is_active = true';
  const params: any[] = [];
  let pi = 1;

  if (search) {
    whereClause += ` AND (p.name ILIKE $${pi} OR pv.sku ILIKE $${pi})`;
    params.push(`%${search}%`);
    pi++;
  }
  if (category) {
    whereClause += ` AND p.category_id = $${pi++}`;
    params.push(category);
  }

  const settingRes = await db.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'low_stock_threshold'`);
  const threshold = parseInt(settingRes.rows[0]?.value || '3');

  if (lowStock === 'true') {
    whereClause += ` AND pv.stock_quantity <= ${threshold}`;
  }

  const countRes = await db.query<{ count: string }>(
    `SELECT COUNT(DISTINCT pv.id) FROM product_variants pv JOIN products p ON p.id = pv.product_id ${whereClause}`,
    params
  );
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await db.query(`
    SELECT pv.*,
           p.name as product_name, p.sku as product_sku, p.type as product_type,
           pc.name as category_name,
           pi.url as product_image,
           (pv.stock_quantity - pv.available_for_rent - pv.damaged_count) as sold_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
    ${whereClause}
    ORDER BY p.name, pv.size
    LIMIT $${pi} OFFSET $${pi + 1}
  `, [...params, limit, offset]);

  res.json(paginatedResponse(dataRes.rows, total, { page, limit, offset }));
}

export async function getInventorySummary(_req: Request, res: Response): Promise<void> {
  const result = await db.query(`
    SELECT
      COUNT(DISTINCT pv.id) as total_variants,
      SUM(pv.stock_quantity) as total_stock,
      SUM(pv.available_for_rent) as total_available_rent,
      SUM(pv.damaged_count) as total_damaged,
      COUNT(DISTINCT pv.id) FILTER (WHERE pv.stock_quantity <= 3) as low_stock_count,
      COUNT(DISTINCT pv.id) FILTER (WHERE pv.stock_quantity = 0) as out_of_stock_count
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.is_active = true
  `);
  res.json(result.rows[0]);
}

export async function recordMovement(req: AuthRequest, res: Response): Promise<void> {
  // stockType: 'sale' (default) | 'rental'
  // For 'in'/'out': determines whether available_for_rent is also updated
  // For 'adjustment': determines whether stock_quantity or available_for_rent is set
  const { variantId, type, quantity, reason, stockType = 'sale' } = req.body;

  if (!variantId || !type || !quantity) {
    res.status(400).json({ error: 'variantId, type, and quantity are required' });
    return;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO inventory_movements (product_variant_id, type, quantity, reason, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [variantId, type, quantity, reason, req.user?.id]);

    if (type === 'in' || type === 'return' || type === 'rental_return') {
      // Also update rental pool if this is a rental return OR explicitly for rental
      const alsoRental = type === 'return' || type === 'rental_return' || stockType === 'rental';
      await client.query(`
        UPDATE product_variants SET
          stock_quantity = stock_quantity + $1,
          available_for_rent = CASE WHEN $2 THEN available_for_rent + $1 ELSE available_for_rent END,
          updated_at = NOW()
        WHERE id = $3
      `, [quantity, alsoRental, variantId]);

    } else if (type === 'out' || type === 'rental_out') {
      const alsoRental = type === 'rental_out' || stockType === 'rental';
      await client.query(`
        UPDATE product_variants SET
          stock_quantity = GREATEST(0, stock_quantity - $1),
          available_for_rent = CASE WHEN $2 THEN GREATEST(0, available_for_rent - $1) ELSE available_for_rent END,
          updated_at = NOW()
        WHERE id = $3
      `, [quantity, alsoRental, variantId]);

    } else if (type === 'damage') {
      await client.query(`
        UPDATE product_variants SET
          damaged_count = damaged_count + $1,
          available_for_rent = GREATEST(0, available_for_rent - $1),
          updated_at = NOW()
        WHERE id = $2
      `, [quantity, variantId]);

    } else if (type === 'adjustment') {
      if (stockType === 'rental') {
        // Set rental allocation (cannot exceed current total stock)
        await client.query(`
          UPDATE product_variants SET
            available_for_rent = LEAST($1, stock_quantity),
            updated_at = NOW()
          WHERE id = $2
        `, [quantity, variantId]);
      } else {
        // Set total stock count
        await client.query(`
          UPDATE product_variants SET
            stock_quantity = $1,
            updated_at = NOW()
          WHERE id = $2
        `, [quantity, variantId]);
      }
    }

    await client.query('COMMIT');

    const variantRes = await db.query(`SELECT * FROM product_variants WHERE id = $1`, [variantId]);
    res.status(201).json(variantRes.rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
}

export async function getMovements(req: Request, res: Response): Promise<void> {
  const { variantId, type, fromDate, toDate } = req.query;
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  let pi = 1;

  if (variantId) {
    whereClause += ` AND im.product_variant_id = $${pi++}`;
    params.push(variantId);
  }
  if (type) {
    whereClause += ` AND im.type = $${pi++}`;
    params.push(type);
  }
  if (fromDate) {
    whereClause += ` AND DATE(im.created_at) >= $${pi++}`;
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ` AND DATE(im.created_at) <= $${pi++}`;
    params.push(toDate);
  }

  const result = await db.query(`
    SELECT im.*,
           p.name as product_name, pv.sku as variant_sku, pv.size, pv.color,
           u.name as created_by_name
    FROM inventory_movements im
    JOIN product_variants pv ON pv.id = im.product_variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN users u ON u.id = im.created_by
    ${whereClause}
    ORDER BY im.created_at DESC
    LIMIT 100
  `, params);

  res.json(result.rows);
}

export async function getLowStockAlerts(_req: Request, res: Response): Promise<void> {
  const settingRes = await db.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'low_stock_threshold'`);
  const threshold = parseInt(settingRes.rows[0]?.value || '3');

  const result = await db.query(`
    SELECT pv.*, p.name as product_name, pc.name as category_name, pi.url as product_image
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
    WHERE p.is_active = true AND pv.stock_quantity <= $1
    ORDER BY pv.stock_quantity ASC
  `, [threshold]);

  res.json({ threshold, items: result.rows });
}
