import { Request, Response } from 'express';
import { db } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { getPagination, paginatedResponse } from '../utils/pagination';

const isManager = (role?: string) => role === 'super_admin' || role === 'manager';

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────

export async function getEmployees(req: Request, res: Response): Promise<void> {
  const { page, limit, offset } = getPagination(req.query);
  const { search } = req.query as Record<string, string>;

  let where = `WHERE u.is_active = true`;
  const params: any[] = [];
  let idx = 1;
  if (search) {
    where += ` AND (u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR ep.department ILIKE $${idx} OR ep.designation ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  const countRes = await db.query(
    `SELECT COUNT(*) FROM users u LEFT JOIN employee_profiles ep ON ep.user_id = u.id ${where}`,
    params
  );
  const total = parseInt((countRes.rows[0] as any).count);

  const dataRes = await db.query(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar_url, u.created_at,
           ep.department, ep.designation, ep.base_salary, ep.join_date,
           ep.address, ep.emergency_contact, ep.notes
    FROM users u
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    ${where}
    ORDER BY u.name ASC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, limit, offset]);

  res.json(paginatedResponse(dataRes.rows, total, { page, limit, offset }));
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const empRes = await db.query(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.avatar_url, u.created_at,
           ep.department, ep.designation, ep.base_salary, ep.join_date,
           ep.address, ep.emergency_contact, ep.notes
    FROM users u
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    WHERE u.id = $1
  `, [id]);

  if (!empRes.rows[0]) { res.status(404).json({ error: 'Employee not found' }); return; }

  const leaveRes = await db.query(`
    SELECT leave_type, COUNT(*)::int as count,
           SUM(end_date - start_date + 1)::int as days
    FROM leave_requests
    WHERE employee_id = $1 AND status = 'approved'
      AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    GROUP BY leave_type
  `, [id]);

  res.json({ ...empRes.rows[0], leaveSummary: leaveRes.rows });
}

export async function upsertEmployeeProfile(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { department, designation, baseSalary, joinDate, address, emergencyContact, notes } = req.body;

  const result = await db.query(`
    INSERT INTO employee_profiles (user_id, department, designation, base_salary, join_date, address, emergency_contact, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id) DO UPDATE SET
      department        = COALESCE($2, employee_profiles.department),
      designation       = COALESCE($3, employee_profiles.designation),
      base_salary       = COALESCE($4, employee_profiles.base_salary),
      join_date         = COALESCE($5, employee_profiles.join_date),
      address           = COALESCE($6, employee_profiles.address),
      emergency_contact = COALESCE($7, employee_profiles.emergency_contact),
      notes             = COALESCE($8, employee_profiles.notes),
      updated_at        = NOW()
    RETURNING *
  `, [id, department || null, designation || null, baseSalary || null, joinDate || null, address || null, emergencyContact || null, notes || null]);

  res.json(result.rows[0]);
}

// ─── LEAVES ──────────────────────────────────────────────────────────────────

export async function getLeaves(req: AuthRequest, res: Response): Promise<void> {
  const { page, limit, offset } = getPagination(req.query);
  const { status, employeeId, month } = req.query as Record<string, string>;

  const params: any[] = [];
  let idx = 1;
  let where = 'WHERE 1=1';

  if (!isManager(req.user?.role)) {
    where += ` AND lr.employee_id = $${idx++}`;
    params.push(req.user?.id);
  } else if (employeeId) {
    where += ` AND lr.employee_id = $${idx++}`;
    params.push(employeeId);
  }
  if (status) { where += ` AND lr.status = $${idx++}`; params.push(status); }
  if (month)  { where += ` AND TO_CHAR(lr.start_date, 'YYYY-MM') = $${idx++}`; params.push(month); }

  const countRes = await db.query(
    `SELECT COUNT(*) FROM leave_requests lr ${where}`, params
  );
  const total = parseInt((countRes.rows[0] as any).count);

  const dataRes = await db.query(`
    SELECT lr.*, u.name as employee_name, u.role as employee_role,
           rv.name as reviewer_name
    FROM leave_requests lr
    JOIN users u ON u.id = lr.employee_id
    LEFT JOIN users rv ON rv.id = lr.reviewed_by
    ${where}
    ORDER BY lr.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `, [...params, limit, offset]);

  res.json(paginatedResponse(dataRes.rows, total, { page, limit, offset }));
}

export async function applyLeave(req: AuthRequest, res: Response): Promise<void> {
  const { leaveType, startDate, endDate, reason } = req.body;

  if (!leaveType || !startDate || !endDate) {
    res.status(400).json({ error: 'leaveType, startDate, endDate are required' }); return;
  }
  if (new Date(startDate) > new Date(endDate)) {
    res.status(400).json({ error: 'Start date must be before end date' }); return;
  }

  const result = await db.query(`
    INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [req.user?.id, leaveType, startDate, endDate, reason || null]);

  const leave = result.rows[0];

  // Notify all managers via system notification
  const empName = req.user?.name || 'An employee';
  const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
  const msg = `${empName} applied for ${leaveType} leave from ${startDate} to ${endDate} (${days} day${days !== 1 ? 's' : ''})`;

  const managers = await db.query(
    `SELECT email, name FROM users WHERE role IN ('super_admin','manager') AND is_active = true`
  );
  for (const mgr of managers.rows as any[]) {
    await db.query(`
      INSERT INTO notification_logs (type, channel, recipient, message, status)
      VALUES ('leave_request_submitted', 'system', $1, $2, 'sent')
    `, [mgr.email, msg]);
  }

  res.status(201).json(leave);
}

export async function reviewLeave(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, reviewNote } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400).json({ error: 'Status must be approved or rejected' }); return;
  }

  const result = await db.query(`
    UPDATE leave_requests SET
      status      = $1,
      review_note = $2,
      reviewed_by = $3,
      reviewed_at = NOW(),
      updated_at  = NOW()
    WHERE id = $4 AND status = 'pending'
    RETURNING *, (SELECT name FROM users WHERE id = employee_id) as employee_name,
               (SELECT email FROM users WHERE id = employee_id) as employee_email
  `, [status, reviewNote || null, req.user?.id, id]);

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Leave request not found or already reviewed' }); return;
  }

  const leave = result.rows[0] as any;
  const msg = `Your ${leave.leave_type} leave request (${leave.start_date} – ${leave.end_date}) has been ${status}${reviewNote ? ': ' + reviewNote : ''}.`;
  await db.query(`
    INSERT INTO notification_logs (type, channel, recipient, message, status)
    VALUES ($1, 'system', $2, $3, 'sent')
  `, [`leave_${status}`, leave.employee_email, msg]);

  res.json(result.rows[0]);
}

export async function cancelLeave(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await db.query(`
    UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
    WHERE id = $1 AND employee_id = $2 AND status = 'pending'
    RETURNING id
  `, [id, req.user?.id]);

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Leave request not found or cannot be cancelled' }); return;
  }
  res.json({ message: 'Cancelled' });
}

export async function getLeaveCalendar(req: AuthRequest, res: Response): Promise<void> {
  const { year, month } = req.query as Record<string, string>;
  const y = parseInt(year) || new Date().getFullYear();
  const m = parseInt(month) || new Date().getMonth() + 1;
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const params: any[] = [from, to];
  let empFilter = '';
  if (!isManager(req.user?.role)) {
    empFilter = ` AND lr.employee_id = $3`;
    params.push(req.user?.id);
  }

  const result = await db.query(`
    SELECT lr.id, lr.leave_type, lr.start_date, lr.end_date, lr.status,
           u.name as employee_name, u.id as employee_id
    FROM leave_requests lr
    JOIN users u ON u.id = lr.employee_id
    WHERE lr.status IN ('approved','pending')
      AND lr.start_date <= $2
      AND lr.end_date   >= $1
      ${empFilter}
    ORDER BY lr.start_date ASC
  `, params);

  res.json(result.rows);
}

// ─── PAYROLL ─────────────────────────────────────────────────────────────────

export async function getPayroll(req: Request, res: Response): Promise<void> {
  const { period } = req.query as Record<string, string>;
  const periodDate = period ? `${period}-01` : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  // Return all active employees, with their payroll record if it exists
  const result = await db.query(`
    SELECT u.id as employee_id, u.name, u.email, u.role,
           ep.department, ep.designation, ep.base_salary as profile_salary,
           pr.id as payroll_id, pr.base_salary, pr.bonuses, pr.deductions,
           pr.net_pay, pr.status, pr.paid_at, pr.notes,
           pby.name as processed_by_name
    FROM users u
    LEFT JOIN employee_profiles ep ON ep.user_id = u.id
    LEFT JOIN payroll_records pr ON pr.employee_id = u.id AND pr.period_month = $1
    LEFT JOIN users pby ON pby.id = pr.processed_by
    WHERE u.is_active = true
    ORDER BY u.name ASC
  `, [periodDate]);

  const rows = result.rows as any[];
  const summary = {
    totalPayroll: rows.reduce((s, r) => s + parseFloat(r.net_pay || r.profile_salary || 0), 0),
    totalPaid:    rows.filter(r => r.status === 'paid').reduce((s, r) => s + parseFloat(r.net_pay || 0), 0),
    employeeCount: rows.length,
    generatedCount: rows.filter(r => r.payroll_id).length,
  };

  res.json({ data: rows, summary, period: periodDate });
}

export async function generatePayroll(req: AuthRequest, res: Response): Promise<void> {
  const { period } = req.params; // YYYY-MM
  const periodDate = `${period}-01`;

  const employees = await db.query(`
    SELECT u.id, ep.base_salary
    FROM users u
    JOIN employee_profiles ep ON ep.user_id = u.id
    WHERE u.is_active = true
  `);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let created = 0;
    for (const emp of employees.rows as any[]) {
      const salary = parseFloat(emp.base_salary || 0);
      const res2 = await client.query(`
        INSERT INTO payroll_records (employee_id, period_month, base_salary, bonuses, deductions, net_pay)
        VALUES ($1, $2, $3, 0, 0, $3)
        ON CONFLICT (employee_id, period_month) DO NOTHING
        RETURNING id
      `, [emp.id, periodDate, salary]);
      if (res2.rows[0]) created++;
    }
    await client.query('COMMIT');
    res.json({ message: `Generated ${created} payroll records`, created });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePayrollRecord(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { bonuses, deductions, notes } = req.body;

  const result = await db.query(`
    UPDATE payroll_records SET
      bonuses    = COALESCE($1, bonuses),
      deductions = COALESCE($2, deductions),
      net_pay    = base_salary + COALESCE($1, bonuses) - COALESCE($2, deductions),
      notes      = COALESCE($3, notes),
      updated_at = NOW()
    WHERE id = $4 AND status != 'paid'
    RETURNING *
  `, [bonuses ?? null, deductions ?? null, notes ?? null, id]);

  if (!result.rows[0]) { res.status(404).json({ error: 'Record not found or already paid' }); return; }
  res.json(result.rows[0]);
}

export async function markPaid(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await db.query(`
    UPDATE payroll_records SET
      status       = 'paid',
      paid_at      = NOW(),
      processed_by = $1,
      updated_at   = NOW()
    WHERE id = $2 AND status != 'paid'
    RETURNING *
  `, [req.user?.id, id]);

  if (!result.rows[0]) { res.status(404).json({ error: 'Record not found or already paid' }); return; }
  res.json(result.rows[0]);
}

export async function bulkMarkPaid(req: AuthRequest, res: Response): Promise<void> {
  const { period } = req.params;
  const periodDate = `${period}-01`;

  const result = await db.query(`
    UPDATE payroll_records SET
      status       = 'paid',
      paid_at      = NOW(),
      processed_by = $1,
      updated_at   = NOW()
    WHERE period_month = $2 AND status IN ('draft','processed')
    RETURNING id
  `, [req.user?.id, periodDate]);

  res.json({ message: `Marked ${result.rowCount} records as paid`, count: result.rowCount });
}
