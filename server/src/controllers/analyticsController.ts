import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getPagination, paginatedResponse } from '../utils/pagination';

const VALID_CATEGORIES = ['stock_purchase', 'equipment', 'rent', 'utilities', 'salaries', 'other'];

function getMonthRange(fromMonth?: string, toMonth?: string): { from: string; to: string } {
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const d = new Date(now);
  d.setMonth(d.getMonth() - 11);
  const defaultFrom = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const fm = fromMonth || defaultFrom;
  const tm = toMonth || defaultTo;

  // from = first day of fromMonth, to = last day of toMonth
  const fromDate = `${fm}-01`;
  const [ty, tm2] = tm.split('-').map(Number);
  const lastDay = new Date(ty, tm2, 0).getDate();
  const toDate = `${tm}-${String(lastDay).padStart(2, '0')}`;

  return { from: fromDate, to: toDate };
}

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const { fromMonth, toMonth } = req.query as Record<string, string>;
  const { from, to } = getMonthRange(fromMonth, toMonth);

  const [salesRows, rentalRows, fineRows, capitalRows, capitalByCategory] = await Promise.all([
    // Monthly sales revenue
    db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
             COALESCE(SUM(total_amount), 0)::float AS revenue
      FROM sales
      WHERE DATE(created_at) BETWEEN $1 AND $2 AND status = 'completed'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY 1 ASC
    `, [from, to]),

    // Monthly rental payments revenue (excluding fines)
    db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') AS month,
             COALESCE(SUM(p.amount), 0)::float AS revenue
      FROM payments p
      JOIN rentals r ON r.id = p.rental_id
      WHERE DATE(p.created_at) BETWEEN $1 AND $2
        AND p.payment_type NOT IN ('fine', 'refund')
      GROUP BY DATE_TRUNC('month', p.created_at)
      ORDER BY 1 ASC
    `, [from, to]),

    // Monthly fines revenue
    db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
             COALESCE(SUM(amount), 0)::float AS revenue
      FROM payments
      WHERE DATE(created_at) BETWEEN $1 AND $2
        AND payment_type = 'fine'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY 1 ASC
    `, [from, to]),

    // Monthly operating expenses (excludes owner contributions)
    db.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', invested_at), 'YYYY-MM') AS month,
             COALESCE(SUM(amount), 0)::float AS capital
      FROM capital_investments
      WHERE invested_at BETWEEN $1 AND $2
        AND category != 'owner_contribution'
      GROUP BY DATE_TRUNC('month', invested_at)
      ORDER BY 1 ASC
    `, [from, to]),

    // Capital by category (excludes owner contributions)
    db.query(`
      SELECT category,
             COALESCE(SUM(amount), 0)::float AS total
      FROM capital_investments
      WHERE invested_at BETWEEN $1 AND $2
        AND category != 'owner_contribution'
      GROUP BY category
      ORDER BY total DESC
    `, [from, to]),
  ]);

  // Build month range list
  const months: string[] = [];
  const [fy, fm2] = from.split('-').map(Number);
  const [ty, tm2] = to.split('-').map(Number);
  let y = fy, m = fm2;
  while (y < ty || (y === ty && m <= tm2)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  // Build revenue map
  const revMap: Record<string, number> = {};
  for (const r of salesRows.rows as any[]) revMap[r.month] = (revMap[r.month] || 0) + r.revenue;
  for (const r of rentalRows.rows as any[]) revMap[r.month] = (revMap[r.month] || 0) + r.revenue;
  for (const r of fineRows.rows as any[]) revMap[r.month] = (revMap[r.month] || 0) + r.revenue;

  const capMap: Record<string, number> = {};
  for (const r of capitalRows.rows as any[]) capMap[r.month] = r.capital;

  const monthlyData = months.map((month) => {
    const revenue = revMap[month] || 0;
    const capital = capMap[month] || 0;
    return { month, revenue, capital, profit: revenue - capital };
  });

  const totalRevenue = monthlyData.reduce((s, r) => s + r.revenue, 0);
  const totalCapital = monthlyData.reduce((s, r) => s + r.capital, 0);
  const netProfit = totalRevenue - totalCapital;
  const profitMarginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100 * 10) / 10 : 0;

  res.json({
    monthlyData,
    summary: { totalRevenue, totalCapital, netProfit, profitMarginPct },
    capitalByCategory: (capitalByCategory.rows as any[]).map((r) => ({ category: r.category, total: r.total })),
  });
}

export async function listCapital(req: Request, res: Response): Promise<void> {
  const { page, limit, offset } = getPagination(req.query);
  const { fromDate, toDate } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  let idx = 1;
  if (fromDate) { where += ` AND ci.invested_at >= $${idx++}`; params.push(fromDate); }
  if (toDate)   { where += ` AND ci.invested_at <= $${idx++}`; params.push(toDate); }

  const countRes = await db.query(
    `SELECT COUNT(*) FROM capital_investments ci ${where}`,
    params
  );
  const total = parseInt((countRes.rows[0] as any).count);

  const dataRes = await db.query(`
    SELECT ci.*, u.name AS created_by_name
    FROM capital_investments ci
    LEFT JOIN users u ON u.id = ci.created_by
    ${where}
    ORDER BY ci.invested_at DESC, ci.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, limit, offset]);

  res.json(paginatedResponse(dataRes.rows, total, { page, limit, offset }));
}

export async function addCapital(req: AuthRequest, res: Response): Promise<void> {
  const { amount, category, note, investedAt } = req.body;

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    res.status(400).json({ error: 'Amount must be a positive number' });
    return;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'Invalid category' });
    return;
  }

  const result = await db.query(`
    INSERT INTO capital_investments (amount, category, note, invested_at, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [parseFloat(amount), category, note || null, investedAt || new Date().toISOString().split('T')[0], req.user?.id || null]);

  res.status(201).json(result.rows[0]);
}

export async function deleteCapital(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await db.query(
    `DELETE FROM capital_investments WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: 'Investment not found' });
    return;
  }
  res.json({ message: 'Deleted' });
}
