-- Product detail fields: the original Printful base price (kept separate from the
-- owner-editable retail price) plus editable description and materials.
ALTER TABLE products ADD COLUMN base_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN description TEXT;
ALTER TABLE products ADD COLUMN materials TEXT;

-- Existing rows: seed the base price from the retail price captured at import,
-- so the list has an original price to show until they are re-imported.
UPDATE products SET base_price_cents = retail_price_cents WHERE base_price_cents = 0;
