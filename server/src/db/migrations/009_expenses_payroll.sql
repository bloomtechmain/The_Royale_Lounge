-- Extend category constraint to include owner_contribution
ALTER TABLE capital_investments
  DROP CONSTRAINT IF EXISTS capital_investments_category_check;

ALTER TABLE capital_investments
  ADD CONSTRAINT capital_investments_category_check
  CHECK (category IN (
    'stock_purchase','equipment','rent','utilities',
    'salaries','other','owner_contribution'
  ));

-- Link salary expenses back to the payroll record (prevents duplicates)
ALTER TABLE capital_investments
  ADD COLUMN IF NOT EXISTS payroll_record_id UUID REFERENCES payroll_records(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_capital_payroll_record
  ON capital_investments (payroll_record_id)
  WHERE payroll_record_id IS NOT NULL;
