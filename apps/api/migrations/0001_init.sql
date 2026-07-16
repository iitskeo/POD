-- Producto: la cosa fisica, importada del proveedor.
CREATE TABLE IF NOT EXISTS products (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'draft',
  source              TEXT NOT NULL DEFAULT 'manual',
  external_product_id TEXT,
  external_variant_id TEXT,
  photo_key           TEXT,
  surface             TEXT NOT NULL DEFAULT 'revolution',
  -- JSON. La silueta no dice donde empieza la banda imprimible: la marca el admin.
  print_band          TEXT,
  calibration         TEXT,
  print_spec          TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- Diseno: lo que se imprime encima. Un producto aloja muchos disenos.
CREATE TABLE IF NOT EXISTS designs (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  base_image_key TEXT,
  -- JSON: elementos colocados (asset / text / photo) con su geometria y slots.
  elements    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_designs_product ON designs(product_id);
CREATE INDEX IF NOT EXISTS idx_designs_status ON designs(status);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL DEFAULT 'pending_payment',
  customer   TEXT NOT NULL,
  shipping   TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  design_id     TEXT NOT NULL REFERENCES designs(id),
  -- JSON: slot_id -> valor. Junto con design_id es la receta y la fuente de verdad.
  values_json   TEXT NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 1,
  -- Nulo hasta que el Worker rasteriza el arte al mandarlo al proveedor.
  print_art_key TEXT,
  preview_key   TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
