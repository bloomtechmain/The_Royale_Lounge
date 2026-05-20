import { Request, Response } from 'express';
import { db } from '../config/database';

export async function getDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const [todaySales, monthRevenue, activeRentals, pendingReturns, lowStock, recentBookings, upcomingReturns] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
        FROM sales WHERE DATE(created_at) = $1 AND status = 'completed'
      `, [today]),

      db.query(`
        SELECT
          COALESCE(SUM(s.total_amount), 0) +
          COALESCE((SELECT SUM(p.amount) FROM payments p
            JOIN rentals r ON r.id = p.rental_id
            WHERE DATE(p.created_at) >= $1
            AND p.payment_type IN ('balance','advance','fine')), 0) as revenue
        FROM sales s
        WHERE DATE(s.created_at) >= $1 AND s.status = 'completed'
      `, [startOfMonth]),

      db.query(`
        SELECT COUNT(*) as count FROM rentals
        WHERE status IN ('reserved','ready_for_pickup','picked_up','late_return')
      `),

      db.query(`
        SELECT COUNT(*) as count FROM rentals
        WHERE status IN ('picked_up','late_return')
        AND rental_end_date <= CURRENT_DATE + 2
      `),

      db.query(`
        SELECT COUNT(*) as count FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE p.is_active = true AND pv.stock_quantity <= 3
      `),

      db.query(`
        SELECT r.booking_number, r.status, r.rental_start_date, r.rental_end_date,
               c.name as customer_name, COUNT(ri.id) as item_count
        FROM rentals r
        JOIN customers c ON c.id = r.customer_id
        LEFT JOIN rental_items ri ON ri.rental_id = r.id
        GROUP BY r.id, c.name
        ORDER BY r.created_at DESC LIMIT 5
      `),

      db.query(`
        SELECT r.booking_number, r.rental_end_date, r.status,
               c.name as customer_name,
               GREATEST(0, CURRENT_DATE - r.rental_end_date) as days_overdue
        FROM rentals r
        JOIN customers c ON c.id = r.customer_id
        WHERE r.status IN ('picked_up','late_return')
        ORDER BY r.rental_end_date ASC LIMIT 5
      `),
    ]);

    res.json({
      todayRevenue: parseFloat((todaySales.rows[0] as any)?.total || '0'),
      todaySalesCount: parseInt((todaySales.rows[0] as any)?.count || '0'),
      monthRevenue: parseFloat((monthRevenue.rows[0] as any)?.revenue || '0'),
      activeRentals: parseInt((activeRentals.rows[0] as any)?.count || '0'),
      pendingReturns: parseInt((pendingReturns.rows[0] as any)?.count || '0'),
      lowStockCount: parseInt((lowStock.rows[0] as any)?.count || '0'),
      recentBookings: recentBookings.rows,
      upcomingReturns: upcomingReturns.rows,
    });
  } catch (err: any) {
    console.error('getDashboardStats error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getRevenueChart(req: Request, res: Response): Promise<void> {
  try {
    const { period = 'month' } = req.query;
    let dateFilter = '';
    let groupBy = '';

    if (period === 'week') {
      dateFilter = `DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'`;
      groupBy = `DATE(created_at)`;
    } else if (period === 'year') {
      dateFilter = `created_at >= CURRENT_DATE - INTERVAL '12 months'`;
      groupBy = `DATE_TRUNC('month', created_at)`;
    } else {
      dateFilter = `DATE(created_at) >= CURRENT_DATE - INTERVAL '30 days'`;
      groupBy = `DATE(created_at)`;
    }

    const pGroupBy = groupBy.replace(/created_at/g, 'p.created_at');
    const pDateFilter = dateFilter.replace(/created_at/g, 'p.created_at');

    const [salesRows, rentalRows, finesRow] = await Promise.all([
      db.query(`
        SELECT TO_CHAR(${groupBy}, 'YYYY-MM-DD') as label,
               COALESCE(SUM(total_amount), 0)::float as revenue
        FROM sales
        WHERE ${dateFilter} AND status = 'completed'
        GROUP BY ${groupBy}
        ORDER BY ${groupBy} ASC
      `),
      db.query(`
        SELECT TO_CHAR(${pGroupBy}, 'YYYY-MM-DD') as label,
               COALESCE(SUM(p.amount), 0)::float as revenue
        FROM payments p
        JOIN rentals r ON r.id = p.rental_id
        WHERE ${pDateFilter} AND p.payment_type != 'fine'
        GROUP BY ${pGroupBy}
        ORDER BY ${pGroupBy} ASC
      `),
      db.query(`
        SELECT COALESCE(SUM(amount), 0)::float as total
        FROM payments
        WHERE payment_type = 'fine' AND ${dateFilter}
      `),
    ]);

    const salesMap = new Map<string, number>(salesRows.rows.map((r: any) => [r.label, r.revenue]));
    const rentalMap = new Map<string, number>(rentalRows.rows.map((r: any) => [r.label, r.revenue]));
    const allLabels = Array.from(new Set([...salesMap.keys(), ...rentalMap.keys()])).sort();

    const chartData = allLabels.map((label) => ({
      label,
      sales_revenue: salesMap.get(label) || 0,
      rental_revenue: rentalMap.get(label) || 0,
      total_revenue: (salesMap.get(label) || 0) + (rentalMap.get(label) || 0),
    }));

    const salesRevenue = salesRows.rows.reduce((s: number, r: any) => s + r.revenue, 0);
    const rentalRevenue = rentalRows.rows.reduce((s: number, r: any) => s + r.revenue, 0);
    const finesCollected: number = (finesRow.rows[0] as any)?.total || 0;

    res.json({
      chartData,
      summary: {
        totalRevenue: salesRevenue + rentalRevenue + finesCollected,
        salesRevenue,
        rentalRevenue,
        finesCollected,
      },
    });
  } catch (err: any) {
    console.error('getRevenueChart error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getSalesReport(req: Request, res: Response): Promise<void> {
  try {
    const { fromDate, toDate } = req.query;
    const from = (fromDate as string) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const to = (toDate as string) || new Date().toISOString().split('T')[0];

    const [summaryRes, itemsCountRes, topProductsRes, paymentMethodsRes, dailySalesRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int                                   AS total_sales,
          COALESCE(SUM(total_amount), 0)::float           AS total_revenue,
          COALESCE(SUM(discount_amount), 0)::float        AS total_discounts,
          COALESCE(SUM(tax_amount), 0)::float             AS total_tax,
          COALESCE(AVG(total_amount), 0)::float           AS avg_sale_value
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2 AND status = 'completed'
      `, [from, to]),

      db.query(`
        SELECT COALESCE(SUM(si.quantity), 0)::int AS total_items_sold
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.status = 'completed'
      `, [from, to]),

      db.query(`
        SELECT si.product_name,
               SUM(si.quantity)::int    AS total_quantity,
               SUM(si.subtotal)::float  AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE DATE(s.created_at) BETWEEN $1 AND $2 AND s.status = 'completed'
        GROUP BY si.product_name
        ORDER BY revenue DESC LIMIT 10
      `, [from, to]),

      db.query(`
        SELECT payment_method,
               COUNT(*)::int           AS count,
               SUM(total_amount)::float AS total_amount
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2 AND status = 'completed'
        GROUP BY payment_method
      `, [from, to]),

      db.query(`
        SELECT DATE(created_at) AS date,
               COUNT(*)::int           AS transactions,
               SUM(total_amount)::float AS revenue
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2 AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [from, to]),
    ]);

    const s = summaryRes.rows[0] as any;
    res.json({
      summary: {
        totalSales: s.total_sales,
        totalRevenue: s.total_revenue,
        totalDiscounts: s.total_discounts,
        totalTax: s.total_tax,
        avgSaleValue: s.avg_sale_value,
        totalItemsSold: (itemsCountRes.rows[0] as any)?.total_items_sold || 0,
      },
      topProducts: topProductsRes.rows,
      paymentMethods: paymentMethodsRes.rows,
      dailySales: dailySalesRes.rows,
    });
  } catch (err: any) {
    console.error('getSalesReport error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getRentalReport(req: Request, res: Response): Promise<void> {
  try {
    const { fromDate, toDate } = req.query;
    const from = (fromDate as string) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const to = (toDate as string) || new Date().toISOString().split('T')[0];

    const [summaryRes, topRentedRes, statusRes, finesRes, offendersRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int                                             AS total_bookings,
          COUNT(*) FILTER (WHERE status = 'completed')::int        AS completed,
          COUNT(*) FILTER (WHERE status IN ('reserved','ready_for_pickup','picked_up','late_return'))::int AS active,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int        AS cancelled,
          COALESCE(SUM(total_rental_cost), 0)::float               AS total_revenue,
          COALESCE(SUM(total_fine), 0)::float                      AS total_fines,
          COALESCE(AVG(rental_end_date - rental_start_date), 0)::float AS avg_rental_days
        FROM rentals
        WHERE DATE(created_at) BETWEEN $1 AND $2
      `, [from, to]),

      db.query(`
        SELECT p.name AS product_name,
               SUM(ri.quantity)::int   AS rental_count,
               COALESCE(SUM(
                 ri.rental_price_per_day * ri.quantity *
                 GREATEST(1, r.rental_end_date - r.rental_start_date)
               ), 0)::float AS total_revenue
        FROM rental_items ri
        JOIN rentals r   ON r.id = ri.rental_id
        JOIN product_variants pv ON pv.id = ri.product_variant_id
        JOIN products p  ON p.id = pv.product_id
        WHERE DATE(r.created_at) BETWEEN $1 AND $2
        GROUP BY p.name
        ORDER BY rental_count DESC
        LIMIT 10
      `, [from, to]),

      db.query(`
        SELECT status, COUNT(*)::int AS count
        FROM rentals
        WHERE DATE(created_at) BETWEEN $1 AND $2
        GROUP BY status
      `, [from, to]),

      db.query(`
        SELECT COUNT(*)::int                                                    AS total_fines_issued,
               COALESCE(SUM(ft.total_fine), 0)::float                          AS total_fine_amount,
               COALESCE(SUM(ft.total_fine) FILTER (WHERE ft.is_paid), 0)::float AS total_collected,
               COALESCE(SUM(ft.total_fine) FILTER (WHERE NOT ft.is_paid), 0)::float AS outstanding_amount
        FROM fine_transactions ft
        JOIN rentals r ON r.id = ft.rental_id
        WHERE DATE(r.created_at) BETWEEN $1 AND $2
      `, [from, to]),

      db.query(`
        SELECT c.id AS customer_id, c.name AS customer_name,
               COUNT(ft.id)::int            AS late_returns,
               COALESCE(SUM(ft.total_fine), 0)::float AS total_fines
        FROM fine_transactions ft
        JOIN rentals r   ON r.id = ft.rental_id
        JOIN customers c ON c.id = r.customer_id
        WHERE DATE(r.created_at) BETWEEN $1 AND $2
        GROUP BY c.id, c.name
        ORDER BY total_fines DESC
        LIMIT 10
      `, [from, to]),
    ]);

    const s = summaryRes.rows[0] as any;
    const totalBookings: number = s.total_bookings;
    const completed: number = s.completed;
    const completionRate = totalBookings > 0 ? Math.round((completed / totalBookings) * 100) : 0;

    const fs = finesRes.rows[0] as any;
    res.json({
      summary: {
        totalBookings,
        totalRevenue: s.total_revenue,
        totalFines: s.total_fines,
        avgRentalDays: Math.round(s.avg_rental_days || 0),
        completionRate,
        active: s.active,
        completed,
        cancelled: s.cancelled,
      },
      topProducts: topRentedRes.rows,
      statusBreakdown: statusRes.rows,
      finesSummary: {
        totalFinesIssued: fs.total_fines_issued,
        totalFineAmount: fs.total_fine_amount,
        totalCollected: fs.total_collected,
        outstandingAmount: fs.outstanding_amount,
      },
      topOffenders: offendersRes.rows,
    });
  } catch (err: any) {
    console.error('getRentalReport error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getExpensesReport(req: Request, res: Response): Promise<void> {
  try {
    const { fromDate, toDate, category, mode } = req.query as Record<string, string>;
    const from = fromDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const to   = toDate   || new Date().toISOString().split('T')[0];

    // mode='owner'    → only owner_contribution
    // mode='expenses' → exclude owner_contribution
    // default         → all
    let modeFilter = '';
    if (mode === 'owner')    modeFilter = ` AND category = 'owner_contribution'`;
    if (mode === 'expenses') modeFilter = ` AND category != 'owner_contribution'`;

    const baseParams: any[] = [from, to];
    const catFilter = category && category !== 'all' ? ` AND category = $3` : '';
    if (category && category !== 'all') baseParams.push(category);

    const combinedFilter = modeFilter + catFilter;

    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];

    const [summaryRes, byCategoryRes, byMonthRes, listRes, thisMonthRes] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
        FROM capital_investments
        WHERE invested_at BETWEEN $1 AND $2${combinedFilter}
      `, baseParams),

      db.query(`
        SELECT category,
               COALESCE(SUM(amount), 0)::float AS total,
               COUNT(*)::int AS count
        FROM capital_investments
        WHERE invested_at BETWEEN $1 AND $2${modeFilter}
        GROUP BY category ORDER BY total DESC
      `, [from, to]),

      db.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', invested_at), 'YYYY-MM') AS month,
               COALESCE(SUM(amount), 0)::float AS total
        FROM capital_investments
        WHERE invested_at BETWEEN $1 AND $2${combinedFilter}
        GROUP BY DATE_TRUNC('month', invested_at)
        ORDER BY 1 ASC
      `, baseParams),

      db.query(`
        SELECT ci.*, u.name AS created_by_name
        FROM capital_investments ci
        LEFT JOIN users u ON u.id = ci.created_by
        WHERE ci.invested_at BETWEEN $1 AND $2${combinedFilter}
        ORDER BY ci.invested_at DESC, ci.created_at DESC
        LIMIT 200
      `, baseParams),

      db.query(`
        SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count
        FROM capital_investments WHERE invested_at >= $1${modeFilter}
      `, [thisMonthStart]),
    ]);

    const s   = summaryRes.rows[0]    as any;
    const tm  = thisMonthRes.rows[0]  as any;
    const byCategory = (byCategoryRes.rows as any[]).filter((r) =>
      mode === 'owner'    ? r.category === 'owner_contribution' :
      mode === 'expenses' ? r.category !== 'owner_contribution' : true
    );

    res.json({
      summary: {
        total:      s.total,
        count:      s.count,
        thisMonth:  tm.total,
        thisMonthCount: tm.count,
        topCategory: byCategory[0]?.category || null,
      },
      byCategory,
      byMonth:  byMonthRes.rows,
      list:     listRes.rows,
    });
  } catch (err: any) {
    console.error('getExpensesReport error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getInventoryReport(_req: Request, res: Response): Promise<void> {
  try {
    const [overviewRes, byCategoryRes, lowStockRes, movementsRes, rentedRes] = await Promise.all([
      db.query(`
        SELECT
          COUNT(DISTINCT pv.id)::int                                                   AS total_skus,
          COALESCE(SUM(pv.stock_quantity), 0)::int                                     AS total_stock,
          COALESCE(SUM(pv.damaged_count), 0)::int                                      AS total_damaged,
          COUNT(DISTINCT pv.id) FILTER (WHERE pv.stock_quantity = 0)::int              AS out_of_stock
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id
        WHERE p.is_active = true
      `),

      db.query(`
        SELECT pc.name                              AS category_name,
               COUNT(DISTINCT p.id)::int            AS products,
               COALESCE(SUM(pv.stock_quantity), 0)::int AS total_stock,
               COALESCE(SUM(pv.available_for_rent), 0)::int AS available
        FROM product_categories pc
        LEFT JOIN products p        ON p.category_id = pc.id AND p.is_active = true
        LEFT JOIN product_variants pv ON pv.product_id = p.id
        GROUP BY pc.id, pc.name
        ORDER BY total_stock DESC
      `),

      db.query(`
        SELECT pv.id       AS variant_id,
               p.name      AS product_name,
               pv.sku, pv.size, pv.color,
               pv.stock_quantity::int
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.stock_quantity <= 3 AND p.is_active = true
        ORDER BY pv.stock_quantity ASC
        LIMIT 20
      `),

      db.query(`
        SELECT type,
               COUNT(*)::int    AS count,
               SUM(quantity)::int AS total_qty
        FROM inventory_movements
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY type
      `),

      db.query(`
        SELECT COUNT(*)::int AS total
        FROM rental_items ri
        JOIN rentals r ON r.id = ri.rental_id
        WHERE r.status IN ('picked_up', 'late_return') AND ri.is_returned = false
      `),
    ]);

    const ov = overviewRes.rows[0] as any;
    res.json({
      summary: {
        totalSkus: ov.total_skus,
        totalStock: ov.total_stock,
        totalRented: (rentedRes.rows[0] as any)?.total || 0,
        totalDamaged: ov.total_damaged,
        outOfStock: ov.out_of_stock,
      },
      byCategory: byCategoryRes.rows,
      lowStock: lowStockRes.rows,
      movements: movementsRes.rows,
    });
  } catch (err: any) {
    console.error('getInventoryReport error:', err);
    res.status(500).json({ error: err.message });
  }
}
