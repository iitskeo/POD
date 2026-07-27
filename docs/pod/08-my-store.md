# Abbiss POD — My Store (landing editor) & product deletion

- **Document:** 8 of 8 (My Store)
- **Status:** Plan — decisions resolved (§8), ready to build.
- **Depends on:** 03-ui-ux.md (design language), 05-backend-schema.md, 07-admin-editor.md.
- **Owner language:** English only (per PRD).

Two admin capabilities:
1. **Delete a product** from My Products when it is no longer wanted.
2. **Edit the storefront landing page** ("My Store") with a friendly, block-based editor
   that keeps the premium aesthetic — add titles, reorder parts, as simple as possible.

---

## 1. Delete product (My Products)

### 1.1 UX
- Each product row gets a **Delete** action (trash icon, in the row's action group), styled
  as destructive (danger color on hover).
- Clicking opens a **confirm modal** naming the product: *"Delete "{name}"? This removes the
  product, its design and its photos. Published orders keep their saved copy. This can't be
  undone."* — with Cancel / Delete (danger).
- Optimistic removal from the list on success; error toast on failure.
- **Published products (DECIDED):** Delete is **only available on drafts**. A published
  product must be **unpublished first** (its Delete is hidden/disabled with a hint
  *"Unpublish to delete"*). Accident-proof: a live product can never be deleted in one click.

### 1.2 API
- **`DELETE /api/products/:id`** (admin only, cookie-guarded):
  - **Reject if the product is `published`** → `409 "Unpublish it first"` (server-side guard
    matching the UI rule).
  - Delete the `products` row and its `designs` row (one design per product).
  - Delete the base photo from R2 (`photo_key`).
  - Best-effort cleanup of product-scoped print files (keys `print-files/pub-{id}-*`).
  - **Do not** cascade into `order_items`: existing draft orders keep their stored snapshot
    (design + slot values + preview) so order history stays intact.
  - Return `204`.
- Idempotent: deleting an unknown id returns `204` (or `404` — see §8 Q4 note).

### 1.3 Client
- `api.deleteProduct(id)` in the shared `ApiClient`.
- `MyProducts` wires the confirm modal + optimistic list update.

---

## 2. My Store — the landing editor

Today **My Store** is only an external link to the storefront, and the storefront landing
(`Catalog.tsx`) is a hard-coded hero ("Make it yours.") + product grid. This turns My Store
into an **in-app editor** for that landing, and makes the storefront render from the saved
config.

Design guardrail: **curated premium blocks**, not freeform layout. The owner adds, reorders
and edits a small set of tasteful blocks; each block ships with defaults that already look
expensive (spec 07 §1 language). No pixel-level dragging — that is what makes page builders
look cheap. Simplicity + a guaranteed premium result over unlimited freedom (see §8 Q1).

### 2.1 Data model & storage
- New table **`landing`** (single-row, one store): a `draft` JSON and a `published` JSON, plus
  `updated_at`. The storefront reads `published`; the admin edits `draft`; **Publish** copies
  `draft → published` (mirrors the product publish model).
- Migration **`0011_landing.sql`**.
- Config shape (versioned):

```jsonc
{
  "version": 1,
  "sections": [
    { "id": "s1", "type": "hero",
      "eyebrow": "Print on demand", "title": "Make it yours.",
      "subtitle": "Personalize a product and see it on the real thing before you buy.",
      "cta": { "label": "Shop now", "target": "#products" },
      "background": { "imageId": null, "color": null } },
    { "id": "s2", "type": "featured", "title": "Featured", "productIds": ["printful-…"] },
    { "id": "s3", "type": "grid", "title": "All products" },
    { "id": "s4", "type": "story", "title": "Our story", "body": "…" },
    { "id": "s5", "type": "imageText", "title": "…", "body": "…", "imageId": "…", "side": "left" },
    { "id": "s6", "type": "cta", "title": "Ready?", "cta": { "label": "Browse", "target": "#products" } }
  ]
}
```
- **Default** (before any edit): `[hero, grid]` — exactly today's landing, so nothing breaks.

### 2.2 Section types — v1 (DECIDED: hero, featured, grid, story)
| Type | Purpose | Editable fields |
|---|---|---|
| **hero** | Top banner | eyebrow, title, subtitle, CTA (label + target), background (image or color) |
| **featured** | Showcase chosen products | title, ordered `productIds` (pick from published) |
| **grid** | The catalog grid | title (optional); shows all published products |
| **story** | Editorial block, optional image | title, body, optional image + side (left/right) |

- **story** merges the plain text and image-beside-text cases: no image → a centered text
  block; with an image → image on the chosen side. One block, less to learn.
- A standalone **cta** strip is deferred to *Later* (the hero already carries a CTA).
- CTA `target`: an in-page anchor (`#products`) or a product (`/p/{slug}`). No arbitrary URLs
  in v1 (keeps it safe and simple).
- Images use the **existing uploads pipeline** (`POST /api/uploads` → `uploadId`).

### 2.3 Shared renderer (parity — "one renderer, both apps")
- A `LandingView` React component lives in **`preview-engine`** and is consumed by **both** the
  storefront (renders `published`) and the admin editor's live preview (renders `draft`). One
  component → identical look, styled with the shared tokens (premium in both). This mirrors the
  existing "one engine, both apps" pattern (spec 07 §5).
- `LandingView` takes `{ config, products, mode }`; `mode: "live" | "editing"` toggles the
  inline edit affordances (admin only).

### 2.4 Admin editor UX ("My Store" becomes a destination)
- **Sidebar:** *My Store* becomes an in-app editor destination (icon + label, active state).
  Keep a small **"Open live store ↗"** external link too.
- **Layout** (premium, spec 07 §1): the **live preview IS the editor** — the `LandingView`
  fills the surface and is edited in place (§ inline WYSIWYG). Chrome around it:
  - A top bar: autosave indicator, **Publish**, *"unpublished changes"* dot, **View live ↗**.
  - An **"+ Add block"** affordance between/after blocks (and a small block menu: hero,
    featured, grid, story).
  - Per-selected-block controls (drag-handle, remove, move up/down) shown on the block.
- **Editing model (DECIDED): inline WYSIWYG.** The owner edits directly on the live preview —
  click a title/subtitle/body to edit it **in place** (contentEditable-style), pick a block to
  reveal its non-text controls (image upload, product picker, CTA target, background) in a small
  floating popover/toolbar near the block. Text is edited where it lives; only the
  non-text bits use a compact inline control. This is the most intuitive path and the owner's
  choice.
  - Implementation notes: each editable text is a focusable, `contentEditable` element in
    `mode="editing"`; on blur/enter it writes back to the block's field (autosave). A block is
    selected on click, showing add-above/below, drag-handle, remove, and its non-text controls.
    Reorder by dragging the block (or its handle) in the preview itself.
- **Guardrails:** every block has tasteful defaults, fixed premium spacing/type, one accent —
  the owner can't produce a broken/cheap layout, even editing in place.

### 2.5 Storefront consumption
- `Catalog` ("/") renders `LandingView` from the **published** config (falls back to the
  default hero+grid when none). `featured`/`grid` blocks pull the published product list.
- No visual regression when a store has never been edited (default == today's landing).

### 2.6 Publish model
- `draft` autosaves as the owner edits; **Publish** copies `draft → published`. An indicator
  shows when there are unpublished changes. This keeps the live store stable while editing.

---

## 3. API surface (all new)
- `GET  /api/landing` — public returns **published** (or default); admin (cookie) returns **draft**.
- `PUT  /api/landing` — admin: save `draft`.
- `POST /api/landing/publish` — admin: copy `draft → published`.
- `DELETE /api/products/:id` — admin: delete product (see §1.2).

CORS/auth follow the existing pattern (admin cookie guard, `authed()` check).

---

## 4. Migration `0011_landing.sql`
```sql
CREATE TABLE IF NOT EXISTS landing (
  id         TEXT PRIMARY KEY DEFAULT 'default',
  draft      TEXT,           -- JSON config (nullable → use default)
  published  TEXT,           -- JSON config (nullable → use default)
  updated_at INTEGER
);
INSERT OR IGNORE INTO landing (id, draft, published, updated_at) VALUES ('default', NULL, NULL, 0);
```
(Applied to local + remote D1; the remote is reachable directly from this environment.)

---

## 5. Phasing
- **v1 (this work):**
  - Delete product (§1) end to end.
  - Landing: model + migration, shared `LandingView`, admin editor (inline WYSIWYG on the live
    preview, add/reorder/remove blocks, autosave + publish), storefront consumption.
  - Section set (DECIDED): **hero, featured, grid, story** (story carries the optional image).
- **Later:** standalone cta strip; brand (store name/logo/accent); collections & filtering;
  SEO (title/description/OG); testimonials; multiple pages.

---

## 6. Files (anticipated)
- **API:** `apps/api/src/index.ts` (routes), `migrations/0011_landing.sql`, `rowToProduct`/types.
- **Engine:** `packages/preview-engine/src/landing.tsx` (LandingView + types), `index.ts` export,
  `api.ts` (`deleteProduct`, `getLanding`, `saveLanding`, `publishLanding`), `types.ts` (config).
- **Admin:** `App.tsx` + `Sidebar.tsx` (new `store` destination), `StoreEditor.tsx` (new),
  `MyProducts.tsx` (delete), styles.
- **Storefront:** `Catalog.tsx` (render LandingView), styles.

---

## 7. Verification
- `tsc` for admin/api/storefront; `vite build` for both SPAs; `wrangler deploy --dry-run` for
  the API; migration applied to remote D1 and confirmed.
- Deploy (API manual; admin/store auto). Owner reviews: create/reorder/edit blocks, publish,
  confirm the live store matches the editor preview; delete a test product.

---

## 8. Decisions (RESOLVED)
- **Q1 — Editor freedom → Curated premium blocks.** Add/reorder/edit a small set of tasteful
  blocks with premium defaults; no freeform layout.
- **Q2 — Editing interaction → Inline WYSIWYG.** Edit text in place on the live preview;
  non-text controls via a compact per-block popover (§2.4).
- **Q3 — v1 section set → hero, featured, grid, story** (story includes the optional
  image-beside-text case). Standalone cta deferred.
- **Q4 — Delete of published products → Require unpublish first.** Delete only on drafts; the
  server also rejects deleting a published product (`409`).
