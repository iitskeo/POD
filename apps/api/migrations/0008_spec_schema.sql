-- Rebuild to the approved backend schema (docs/pod/05-backend-schema.md section 2).
--
-- stores and oauth_states are kept as-is: they already match the spec and hold the
-- live Printful token, so dropping them would force a reconnect. The rest are test
-- data in an obsolete shape and are recreated to the spec; the owner re-imports.

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS designs;
DROP TABLE IF EXISTS products;

-- Owner-managed graphics (clipart library) for authoring and graphic-choice slots.
-- Owner content, NOT Printful's proprietary clipart.
CREATE TABLE IF NOT EXISTS assets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  collection    TEXT,
  storage_key   TEXT NOT NULL,
  kind          TEXT NOT NULL,               -- 'svg' | 'png'
  aspect        REAL NOT NULL DEFAULT 1,
  recolor_parts TEXT,                          -- JSON: string[]
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_collection ON assets(collection);

-- Owner-made premade element combos ("quick designs").
CREATE TABLE IF NOT EXISTS quick_designs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  thumb_key  TEXT,
  elements   TEXT NOT NULL,                    -- JSON: Element[]
  created_at INTEGER NOT NULL
);

-- A Printful product imported into Abbiss.
CREATE TABLE products (
  id                  TEXT PRIMARY KEY,        -- e.g. 'printful-71-4011'
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',    -- 'draft' | 'published'
  source              TEXT NOT NULL DEFAULT 'printful',
  external_product_id TEXT NOT NULL,
  external_variant_id TEXT,
  photo_key           TEXT,
  retail_price_cents  INTEGER NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  placements          TEXT NOT NULL,           -- JSON: Placement[]
  variant_templates   TEXT,                    -- JSON: { [variantId]: Placement[] }
  variants            TEXT NOT NULL,           -- JSON: Variant[]
  techniques          TEXT,                    -- JSON: string[]
  store_id            TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_products_status ON products(status);

-- The customization composition for a product (one per product).
CREATE TABLE designs (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  elements    TEXT NOT NULL,                   -- JSON: Element[]
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_designs_product ON designs(product_id);

-- A guest order captured at checkout. Never charged in MVP.
CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  reference      TEXT NOT NULL UNIQUE,         -- 'ABB-7F3K2'
  status         TEXT NOT NULL DEFAULT 'draft',
  email          TEXT NOT NULL,
  notify         INTEGER NOT NULL DEFAULT 1,
  shipping       TEXT NOT NULL,                -- JSON: ShippingAddress
  subtotal_cents INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE order_items (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id),
  product_id     TEXT NOT NULL REFERENCES products(id),
  design_id      TEXT NOT NULL REFERENCES designs(id),
  variant_id     TEXT NOT NULL,
  variant_label  TEXT NOT NULL,
  slot_values    TEXT NOT NULL,                -- JSON: SlotValues
  qty            INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  preview_key    TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
