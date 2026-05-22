-- ─────────────────────────────────────────────────────────────────────────────
-- PROMOTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  type              VARCHAR(50) NOT NULL
    CHECK (type IN ('percentage', 'flat_amount', 'buy_x_get_y', 'free_item')),
  scope             VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (scope IN ('pos', 'rental', 'both')),

  -- type-specific fields
  percentage_value  DECIMAL(5,2),           -- used when type = 'percentage' (e.g. 10.00 = 10%)
  flat_amount_value DECIMAL(10,2),          -- used when type = 'flat_amount'
  buy_quantity      INTEGER,                -- used when type = 'buy_x_get_y'
  get_quantity      INTEGER,                -- used when type = 'buy_x_get_y'
  free_variant_id   UUID REFERENCES product_variants(id) ON DELETE SET NULL,
                                            -- used when type = 'free_item'

  -- constraints
  min_order_amount  DECIMAL(10,2),          -- NULL = no minimum
  max_usage_count   INTEGER,                -- NULL = unlimited
  usage_count       INTEGER NOT NULL DEFAULT 0,

  -- validity
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,

  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROMOTION USAGES  (one row per transaction that used a promotion)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotion_usages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id    UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  sale_id         UUID REFERENCES sales(id)   ON DELETE SET NULL,
  rental_id       UUID REFERENCES rentals(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  used_by         UUID REFERENCES users(id)   ON DELETE SET NULL,
  used_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_usage_has_ref CHECK (sale_id IS NOT NULL OR rental_id IS NOT NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_promotions_scope        ON promotions(scope);
CREATE INDEX IF NOT EXISTS idx_promotions_active_dates ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_promo  ON promotion_usages(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_sale   ON promotion_usages(sale_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_rental ON promotion_usages(rental_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLE PERMISSIONS  for 'promotions' module
-- admin bypasses via isSuperAdmin check in usePermissions
-- manager: can see + manage promotions page
-- cashier: no sidebar access (hidden), but getActive endpoint is accessible via authenticate only
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO role_permissions (role, module, can_read, can_write) VALUES
  ('manager',         'promotions', true,  true),
  ('cashier',         'promotions', false, false),
  ('inventory_staff', 'promotions', false, false)
ON CONFLICT (role, module) DO NOTHING;
