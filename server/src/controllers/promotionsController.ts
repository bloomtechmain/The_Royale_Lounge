import { Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const PROMO_SELECT = `
  SELECT p.*,
         pv.sku          AS free_variant_sku,
         prod.name       AS free_product_name,
         pv.size         AS free_variant_size,
         pv.color        AS free_variant_color,
         pv.selling_price              AS free_variant_selling_price,
         pv.rental_price_per_day       AS free_variant_rental_price_per_day,
         u.name          AS created_by_name
  FROM promotions p
  LEFT JOIN product_variants pv   ON pv.id   = p.free_variant_id
  LEFT JOIN products prod          ON prod.id = pv.product_id
  LEFT JOIN users u                ON u.id    = p.created_by
`;

export async function listPromotions(_req: AuthRequest, res: Response): Promise<void> {
  const result = await db.query(`${PROMO_SELECT} ORDER BY p.created_at DESC`);
  res.json(result.rows);
}

export async function getActivePromotions(req: AuthRequest, res: Response): Promise<void> {
  const scope = (req.query.scope as string) || 'both';
  const result = await db.query(`
    ${PROMO_SELECT}
    WHERE p.is_active = true
      AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
      AND (p.max_usage_count IS NULL OR p.usage_count < p.max_usage_count)
      AND (p.scope = $1 OR p.scope = 'both')
    ORDER BY p.name ASC
  `, [scope]);
  res.json(result.rows);
}

export async function createPromotion(req: AuthRequest, res: Response): Promise<void> {
  const {
    name, description, type, scope = 'both',
    percentage_value, flat_amount_value,
    buy_quantity, get_quantity, free_variant_id,
    min_order_amount, max_usage_count,
    start_date, end_date, is_active = true,
  } = req.body;

  if (!name || !type || !start_date || !end_date) {
    res.status(400).json({ error: 'name, type, start_date and end_date are required' });
    return;
  }
  if (new Date(start_date) > new Date(end_date)) {
    res.status(400).json({ error: 'start_date must be before or equal to end_date' });
    return;
  }

  const validationError = validateTypeFields(type, {
    percentage_value, flat_amount_value, buy_quantity, get_quantity, free_variant_id,
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const result = await db.query(`
    INSERT INTO promotions (
      name, description, type, scope,
      percentage_value, flat_amount_value,
      buy_quantity, get_quantity, free_variant_id,
      min_order_amount, max_usage_count,
      start_date, end_date, is_active, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    name, description || null, type, scope,
    percentage_value || null, flat_amount_value || null,
    buy_quantity || null, get_quantity || null, free_variant_id || null,
    min_order_amount || null, max_usage_count || null,
    start_date, end_date, is_active, req.user?.id,
  ]);

  const promo = result.rows[0];

  // Return with joined data
  const full = await db.query(`${PROMO_SELECT} WHERE p.id = $1`, [promo.id]);
  res.status(201).json(full.rows[0]);
}

export async function updatePromotion(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const {
    name, description, scope,
    percentage_value, flat_amount_value,
    buy_quantity, get_quantity, free_variant_id,
    min_order_amount, max_usage_count,
    start_date, end_date, is_active,
  } = req.body;

  const existing = await db.query(`SELECT * FROM promotions WHERE id = $1`, [id]);
  if (!existing.rows[0]) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }

  const promo = existing.rows[0];
  const type = promo.type; // type is immutable

  if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
    res.status(400).json({ error: 'start_date must be before or equal to end_date' });
    return;
  }

  const validationError = validateTypeFields(type, {
    percentage_value: percentage_value ?? promo.percentage_value,
    flat_amount_value: flat_amount_value ?? promo.flat_amount_value,
    buy_quantity: buy_quantity ?? promo.buy_quantity,
    get_quantity: get_quantity ?? promo.get_quantity,
    free_variant_id: free_variant_id ?? promo.free_variant_id,
  });
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const result = await db.query(`
    UPDATE promotions SET
      name              = COALESCE($1, name),
      description       = COALESCE($2, description),
      scope             = COALESCE($3, scope),
      percentage_value  = COALESCE($4, percentage_value),
      flat_amount_value = COALESCE($5, flat_amount_value),
      buy_quantity      = COALESCE($6, buy_quantity),
      get_quantity      = COALESCE($7, get_quantity),
      free_variant_id   = COALESCE($8, free_variant_id),
      min_order_amount  = COALESCE($9, min_order_amount),
      max_usage_count   = COALESCE($10, max_usage_count),
      start_date        = COALESCE($11, start_date),
      end_date          = COALESCE($12, end_date),
      is_active         = COALESCE($13, is_active),
      updated_at        = NOW()
    WHERE id = $14
    RETURNING *
  `, [
    name || null, description || null, scope || null,
    percentage_value ?? null, flat_amount_value ?? null,
    buy_quantity ?? null, get_quantity ?? null, free_variant_id ?? null,
    min_order_amount ?? null, max_usage_count ?? null,
    start_date || null, end_date || null,
    is_active !== undefined ? is_active : null,
    id,
  ]);

  const full = await db.query(`${PROMO_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
  res.json(full.rows[0]);
}

export async function togglePromotion(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await db.query(`
    UPDATE promotions SET is_active = NOT is_active, updated_at = NOW()
    WHERE id = $1 RETURNING *
  `, [id]);
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }
  res.json(result.rows[0]);
}

export async function deletePromotion(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  // Soft-delete
  const result = await db.query(`
    UPDATE promotions SET is_active = false, updated_at = NOW()
    WHERE id = $1 RETURNING id
  `, [id]);
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }
  res.status(204).send();
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function validateTypeFields(
  type: string,
  fields: {
    percentage_value?: any;
    flat_amount_value?: any;
    buy_quantity?: any;
    get_quantity?: any;
    free_variant_id?: any;
  }
): string | null {
  const { percentage_value, flat_amount_value, buy_quantity, get_quantity, free_variant_id } = fields;
  if (type === 'percentage') {
    if (!percentage_value || percentage_value <= 0 || percentage_value > 100)
      return 'percentage_value must be between 0.01 and 100';
  } else if (type === 'flat_amount') {
    if (!flat_amount_value || flat_amount_value <= 0)
      return 'flat_amount_value must be greater than 0';
  } else if (type === 'buy_x_get_y') {
    if (!buy_quantity || buy_quantity <= 0) return 'buy_quantity must be greater than 0';
    if (!get_quantity || get_quantity <= 0) return 'get_quantity must be greater than 0';
  } else if (type === 'free_item') {
    if (!free_variant_id) return 'free_variant_id is required for free_item promotions';
  } else {
    return 'type must be one of: percentage, flat_amount, buy_x_get_y, free_item';
  }
  return null;
}
