# Abbiss POD — Backend Schema & API Contract

- **Document:** 5 of 6 (Backend Schema)
- **Status:** Approved for build
- **Depends on:** 02-trd.md
- **Stack:** Cloudflare D1 (SQLite), R2, Workers. All identifiers English, snake_case.

---

## 1. Entity Overview
- **store** — the connected Printful account + tokens (one row in MVP).
- **oauth_state** — CSRF nonce during Printful OAuth.
- **asset** — an owner-uploaded graphic used by graphic-choice slots.
- **product** — a Printful product imported into Abbiss (template + printfile sizes +
  variants + retail price).
- **design** — the customization composition for a product (elements + slots). One per
  product in MVP.
- **order** — a guest checkout captured as a draft (no payment).
- **order_item** — a customized line in an order (design + variant + slot values).

Admin sessions are **stateless** (HMAC-signed cookie), so there is no sessions table.

## 2. SQL Schema (D1 / SQLite)

```sql
-- Printful connection. Token lives here, never in the browser or code.
CREATE TABLE stores (
  id            TEXT PRIMARY KEY,            -- 'printful' (single store in MVP)
  provider      TEXT NOT NULL DEFAULT 'printful',
  external_id   TEXT,                        -- Printful store id, if any
  name          TEXT,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    INTEGER,                     -- epoch ms
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- OAuth CSRF state, verified and deleted on callback.
CREATE TABLE oauth_states (
  state      TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Owner-managed graphics (clipart library) used in authoring and graphic-choice slots.
-- This is owner content, NOT Printful's proprietary clipart.
CREATE TABLE assets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  collection    TEXT,                        -- category/theme for the library
  storage_key   TEXT NOT NULL,               -- R2 key
  kind          TEXT NOT NULL,               -- 'svg' | 'png'
  aspect        REAL NOT NULL DEFAULT 1,     -- w/h of the graphic
  recolor_parts TEXT,                        -- JSON: string[] of recolorable part names
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_assets_collection ON assets(collection);

-- Owner-made premade element combos ("quick designs") to drag onto a placement.
CREATE TABLE quick_designs (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  thumb_key  TEXT,                            -- R2 preview thumbnail
  elements   TEXT NOT NULL,                   -- JSON: Element[] (placement-relative)
  created_at INTEGER NOT NULL
);

-- A Printful product imported into Abbiss.
CREATE TABLE products (
  id                  TEXT PRIMARY KEY,       -- e.g. 'printful-71-4011'
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  source              TEXT NOT NULL DEFAULT 'printful',
  external_product_id TEXT NOT NULL,          -- Printful catalog product id
  external_variant_id TEXT,                   -- representative variant (for mockups)
  photo_key           TEXT,                   -- R2 base image
  retail_price_cents  INTEGER NOT NULL DEFAULT 0,      -- manual, USD
  currency            TEXT NOT NULL DEFAULT 'USD',
  placements          TEXT NOT NULL,          -- JSON: Placement[] (see 3.1), representative
  variant_templates   TEXT,                   -- JSON: { [variantId]: Placement[] } overrides
                                              --   where the template differs by color; enables
                                              --   live garment-color switching in the editor
  variants            TEXT NOT NULL,          -- JSON: Variant[] (see 3.2)
  techniques          TEXT,                   -- JSON: string[]
  store_id            TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_products_status ON products(status);

-- The customization composition for a product.
CREATE TABLE designs (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',  -- mirrors the product's publish state
  elements    TEXT NOT NULL,                  -- JSON: Element[] (see 3.3)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_designs_product ON designs(product_id);

-- A guest order captured at checkout. Never charged in MVP.
CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  reference      TEXT NOT NULL UNIQUE,        -- human ref, e.g. 'ABB-7F3K2'
  status         TEXT NOT NULL DEFAULT 'draft',
  email          TEXT NOT NULL,
  notify         INTEGER NOT NULL DEFAULT 1,  -- notify when payments launch
  shipping       TEXT NOT NULL,               -- JSON: ShippingAddress (see 3.5)
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
  variant_id     TEXT NOT NULL,               -- Printful variant id
  variant_label  TEXT NOT NULL,               -- 'M / Black'
  slot_values    TEXT NOT NULL,               -- JSON: SlotValues (see 3.4)
  qty            INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  preview_key    TEXT,                         -- R2 saved preview thumbnail
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

## 3. JSON Shapes

### 3.1 Placement (inside `products.placements`)
```ts
interface Placement {
  placement: string;              // 'front' | 'back' | 'sleeve_left' | 'sleeve_right' | ...
  imageUrl: string;               // Printful flat template image for this panel
  backgroundColor: string | null;
  templateWidth: number;          // px of the template image
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number }; // in template px
  printSpec: { widthPx: number; heightPx: number; dpi: number };            // print file size
  technique: string;              // e.g. 'dtg', 'sublimation'
}
```

### 3.2 Variant (inside `products.variants`)
```ts
interface Variant {
  id: number;                     // Printful catalog variant id
  size: string | null;
  color: string | null;
  colorCode: string | null;       // hex for the swatch
  image: string;                  // Printful variant image
}
```

### 3.3 Element (inside `designs.elements`)
Discriminated by `kind`. Each element lives on one placement, in that placement's print
file coordinates.

```ts
type Element = TextElement | GraphicElement | ImageElement | PatternElement | BackgroundElement;

interface Rect { x: number; y: number; w: number; h: number }

// Common to every element.
interface ElementBase {
  id: string;
  placement: string;              // 'front' | 'back' | 'sleeve_left' | ...
  rect: Rect;                     // in the placement's print-file coordinates
  z: number;                      // draw order
  rotation?: number;              // degrees, default 0
  locked?: boolean;               // owner-locked in the editor
  hidden?: boolean;               // hidden in the editor
}

interface TextElement extends ElementBase {
  kind: 'text';
  content: string;                // default/sample text
  font: string;
  color: string;                  // default color
  align: 'left' | 'center' | 'right';
  maxLines: number;
  minSizeFrac: number;            // min legible size as fraction of file height
  maxChars: number;
  letterSpacing?: number;         // px
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; dx: number; dy: number };
  arc?: number;                   // text curve, degrees (0 = straight)
  // Slot exposure:
  editable: boolean;              // true => customer can type (editable-text slot)
  textLabel?: string;             // slot label shown to the customer
  colorSlot?: { label: string; options: string[]; default: string };
}

interface GraphicElement extends ElementBase {
  kind: 'graphic';
  assetId: string;                // default graphic (assets.id)
  choiceSlot?: { label: string; options: string[] };            // graphic-choice slot
  colorSlot?: { label: string; part: string; options: string[]; default: string };
}

// Owner-uploaded raster/vector placed directly (authoring only; not a customer slot).
interface ImageElement extends ElementBase {
  kind: 'image';
  storageKey: string;             // R2 key of the uploaded file
  aspect: number;
}

// Any element (uploaded art, graphic) turned into a seamless all-over pattern.
interface PatternElement extends ElementBase {
  kind: 'pattern';
  source: { assetId?: string; storageKey?: string };  // the repeated component
  type: 'half_drop' | 'block' | 'brick' | 'reflect' | 'line_h' | 'line_v';
  scale: number;                  // component size factor
  spacing: number;                // gap between repeats, px
  color?: string;                 // recolor of the component (optional)
}

// A solid or graphic fill for the whole placement print area (z = 0).
interface BackgroundElement extends ElementBase {
  kind: 'background';
  fill: { color?: string; assetId?: string; storageKey?: string };
}
```

Notes:
- `ImageElement`, `PatternElement`, and `BackgroundElement` are **authoring-only** (the
  owner). Customer-editable slots remain limited to `editable` text, `colorSlot`, and
  `choiceSlot` (PRD section 8).
- All authored files (uploads, backgrounds, pattern sources) live in R2 and are
  referenced by `storageKey` / `assetId`, so a saved design carries no large blobs.

Slot type mapping (PRD section 8):
- **Editable text** = `TextElement.editable = true`.
- **Color choice** = `colorSlot` on a text or graphic element.
- **Graphic choice** = `GraphicElement.choiceSlot`.
An element with none of these exposed is **fixed** (owner-only).

### 3.4 SlotValues (inside `order_items.slot_values`, and the live editor state)
```ts
// Keyed by element:
//   '<elementId>'          -> chosen text        (editable text)
//   '<elementId>.graphic'  -> chosen asset id    (graphic choice)
//   '<elementId>.color'    -> chosen hex color   (color choice)
type SlotValues = Record<string, string>;
```

### 3.5 ShippingAddress (inside `orders.shipping`)
```ts
interface ShippingAddress {
  fullName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;                  // US state code
  zip: string;
  country: 'US';
}
```

## 4. R2 Layout
| Key pattern | Content |
|-------------|---------|
| `products/{productId}/{variantId}/photo` | Imported Printful base imagery (per variant) |
| `assets/{assetId}.{svg\|png}` | Owner graphics library (clipart) |
| `uploads/{uploadId}.{png\|jpg\|svg}` | Owner-uploaded authoring artwork (image/pattern/background) |
| `quick-designs/{id}.png` | Quick-design thumbnails |
| `print-files/{key}.png` | Generated print files (`{designId}-{placement}` or `preview-{sessionId}-{placement}`) |
| `previews/{orderItemId}.png` | Saved customized preview thumbnail |

Print files are the only intentionally public generated objects (Printful fetches them
over HTTP); they contain no PII.

## 5. API Contract

Base: the API Worker. `Content-Type: application/json`. Errors: `{ "error": string }`
with the appropriate status. Admin-only routes require the session cookie.

### 5.1 Admin auth
| Method | Path | Auth | Body / Query | Response |
|--------|------|------|--------------|----------|
| POST | `/api/admin/login` | none | `{ passphrase }` | 204 + Set-Cookie session; 401 on fail |
| POST | `/api/admin/logout` | cookie | — | 204, clears cookie |
| GET | `/api/admin/session` | none | — | `{ authenticated: boolean }` |

Cookie: `abbiss_admin`, httpOnly, Secure, SameSite=Strict, HMAC-signed, expiring.

### 5.2 Printful (admin)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/printful/connect` | cookie | Stores state, 302 to Printful authorize |
| GET | `/api/printful/callback` | none | Verifies state, exchanges code, stores tokens, 302 back |
| GET | `/api/printful/status` | cookie | `{ connected, storeName, storeId }` |
| GET | `/api/printful/catalog` | cookie | Paged catalog (region `north_america`) |
| GET | `/api/printful/catalog/{id}` | cookie | `{ product, styles, variants }` |
| GET | `/api/printful/catalog/{id}/variants` | cookie | Paged variants |
| GET | `/api/printful/catalog/{id}/prices` | cookie | Reference prices |
| POST | `/api/printful/import` | cookie | `{ productId }` -> one-click import: all placements + all variants + templates/printfiles + prices; creates an empty design; returns `{ productId, designId }` to open the editor |

### 5.3 Products
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/api/products` | public | — | Published products (all if cookie present) |
| GET | `/api/products/{slug}` | public | — | One published product (with placements, variants) |
| PATCH | `/api/products/{id}` | cookie | `{ name?, retailPriceCents?, status? }` | Updated product |

### 5.4 Designs
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/api/designs/{productId}` | public | — | The product's published design (draft needs cookie) |
| PUT | `/api/designs/{id}` | cookie | `{ productId, name, status, elements }` | Saved design |

### 5.5 Assets, uploads & quick designs
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/api/assets` | cookie | `?collection=` | `Asset[]` (owner graphics library) |
| POST | `/api/assets` | cookie | multipart (file, name, collection, recolorParts) | Created asset |
| GET | `/api/assets/{id}/file` | public | — | The graphic bytes |
| POST | `/api/uploads` | cookie | multipart (file) | `{ uploadId, url, aspect }` (authoring artwork) |
| GET | `/api/uploads/{id}` | public | — | The uploaded file bytes |
| GET | `/api/quick-designs` | cookie | — | `QuickDesign[]` |
| POST | `/api/quick-designs` | cookie | `{ name, elements }` | Created quick design |

### 5.6 Mockup & print files
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| PUT | `/api/print-files/{key}` | cookie or storefront | PNG bytes | `{ url }` |
| GET | `/api/print-files/{key}` | public | — | PNG bytes |
| POST | `/api/mockup` | public (rate-limited) | `{ productId, files: [{ placement, printFileUrl }] }` | `string[]` (mockup URLs) |

### 5.7 Orders
| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/api/orders` | public | `{ email, notify, shipping, items: [{ productId, designId, variantId, variantLabel, slotValues, qty }] }` | `{ id, reference, status: 'draft' }` |
| GET | `/api/orders` | cookie | — | `Order[]` (owner) |
| GET | `/api/orders/{reference}` | public | — | Order by reference (for confirmation page) |

## 6. Validation Rules
- `products.retail_price_cents` >= 0; `currency` fixed 'USD'.
- Every text slot value length <= its `maxChars`; server rejects over-limit items.
- `order_items.variant_id` must belong to the product's `variants`.
- Graphic-choice value must be within `choiceSlot.options`; color value within
  `colorSlot.options`; otherwise the server falls back to the slot default.
- Published products must have a design whose every slot has a valid default.

## 7. Migrations
Applied via `wrangler d1 migrations apply`, one file per change, forward-only. Initial
migration creates all tables in section 2. JSON columns evolve without schema changes;
structural changes ship as new migrations.
