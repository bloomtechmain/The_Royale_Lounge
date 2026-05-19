-- Role-based module permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role   VARCHAR(50)  NOT NULL,
  module VARCHAR(100) NOT NULL,
  can_read  BOOLEAN DEFAULT false,
  can_write BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (role, module)
);

-- Default permissions
INSERT INTO role_permissions (role, module, can_read, can_write) VALUES
('manager',         'dashboard',     true,  true),
('manager',         'pos',           true,  true),
('manager',         'rentals',       true,  true),
('manager',         'returns',       true,  true),
('manager',         'products',      true,  true),
('manager',         'customers',     true,  true),
('manager',         'inventory',     true,  true),
('manager',         'reports',       true,  true),
('manager',         'notifications', true,  true),
('manager',         'settings',      true,  false),
('cashier',         'dashboard',     true,  false),
('cashier',         'pos',           true,  true),
('cashier',         'rentals',       true,  true),
('cashier',         'returns',       true,  true),
('cashier',         'products',      true,  false),
('cashier',         'customers',     true,  true),
('cashier',         'inventory',     false, false),
('cashier',         'reports',       false, false),
('cashier',         'notifications', true,  false),
('cashier',         'settings',      false, false),
('inventory_staff', 'dashboard',     true,  false),
('inventory_staff', 'pos',           false, false),
('inventory_staff', 'rentals',       true,  false),
('inventory_staff', 'returns',       true,  true),
('inventory_staff', 'products',      true,  true),
('inventory_staff', 'customers',     false, false),
('inventory_staff', 'inventory',     true,  true),
('inventory_staff', 'reports',       false, false),
('inventory_staff', 'notifications', true,  false),
('inventory_staff', 'settings',      false, false)
ON CONFLICT (role, module) DO NOTHING;
