-- Employee profiles (extends users with HR details)
CREATE TABLE IF NOT EXISTS employee_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  department        VARCHAR(100),
  designation       VARCHAR(100),
  base_salary       DECIMAL(12,2) DEFAULT 0,
  join_date         DATE,
  address           TEXT,
  emergency_contact VARCHAR(255),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Leave requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  leave_type    VARCHAR(50) NOT NULL CHECK (leave_type IN ('annual','sick','casual','unpaid')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests (employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_status   ON leave_requests (status);

-- Monthly payroll records (one row per employee per month)
CREATE TABLE IF NOT EXISTS payroll_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  period_month  DATE NOT NULL,
  base_salary   DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonuses       DECIMAL(12,2) DEFAULT 0,
  deductions    DECIMAL(12,2) DEFAULT 0,
  net_pay       DECIMAL(12,2) DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'draft'
                CHECK (status IN ('draft','processed','paid')),
  paid_at       TIMESTAMPTZ,
  processed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, period_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records (period_month, status);

-- HR permissions
INSERT INTO role_permissions (role, module, can_read, can_write) VALUES
  ('manager',         'employees', true,  true),
  ('manager',         'payroll',   true,  true),
  ('cashier',         'employees', true,  false),
  ('cashier',         'payroll',   false, false),
  ('inventory_staff', 'employees', true,  false),
  ('inventory_staff', 'payroll',   false, false)
ON CONFLICT (role, module) DO NOTHING;
