-- Add damage_remark column to rental_items for storing per-item damage notes
ALTER TABLE rental_items ADD COLUMN IF NOT EXISTS damage_remark TEXT;
