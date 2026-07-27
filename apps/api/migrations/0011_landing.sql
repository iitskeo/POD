-- Landing page config for My Store (docs/pod/08-my-store.md §2.1).
-- Single-row table (one brand/store): a draft the admin edits and a published copy the
-- storefront reads. NULL means "use the default landing" (hero + product grid).
CREATE TABLE IF NOT EXISTS landing (
  id         TEXT PRIMARY KEY,   -- always 'default'
  draft      TEXT,               -- JSON LandingConfig (nullable)
  published  TEXT,               -- JSON LandingConfig (nullable)
  updated_at INTEGER
);

INSERT OR IGNORE INTO landing (id, draft, published, updated_at) VALUES ('default', NULL, NULL, 0);
