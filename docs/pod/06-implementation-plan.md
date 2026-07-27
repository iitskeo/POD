# Abbiss POD — Implementation Plan

- **Document:** 6 of 7 (Implementation Plan)
- **Status:** Approved for build. **M4 (admin editor) is re-scoped by `07-admin-editor.md`**
  around its P0/P1/P2 phases — see §2 M4.
- **Depends on:** 01–05
- **Related:** 07-admin-editor.md

---

## 1. Approach
- **Vertical slices, verified end to end.** Each milestone ships something demonstrable
  and is not "done" until its acceptance criteria pass.
- **One engine, two apps.** Build `preview-engine` once; both SPAs consume it.
- **English only** in code, comments, DB identifiers, and UI, from the first commit.
- **Definition of Done (every milestone):** TypeScript strict passes, both affected SPAs
  build, the Worker deploys, acceptance criteria met, and the primary flow is driven in a
  real browser (not only unit-tested).

## 2. Milestones

### M0 — Foundations
**Scope**
- npm-workspaces monorepo: `apps/storefront`, `apps/admin`, `apps/api`,
  `packages/preview-engine`.
- TypeScript strict everywhere; Vite for SPAs; Wrangler for the Worker.
- Cloudflare bindings: D1 database, R2 bucket; `wrangler.toml` per app.
- Initial D1 migration creating every table in 05-backend-schema.md section 2.
- Design tokens + base CSS (section 2 of the UI/UX doc) as a shared stylesheet baseline
  (light storefront, dark admin).
- Deploy skeletons: storefront, admin (empty shells), API (health route).

**Acceptance**
- All three apps build and deploy; `GET /api/health` returns ok; migration applied;
  R2/D1 bindings resolve.

### M1 — Admin Authentication
**Scope**
- `POST /api/admin/login` (passphrase → HMAC-signed httpOnly cookie), `logout`,
  `GET /api/admin/session`.
- Admin-route guard middleware in the Worker.
- Admin SPA login screen + session bootstrap; redirect unauthenticated users.

**Acceptance**
- Correct passphrase logs in on any device; wrong passphrase 401s; admin API routes
  reject requests without a valid cookie; logout clears it.

### M2 — Printful Connection & Import
**Scope**
- OAuth: `connect`, `callback` (state CSRF), token storage + preemptive/reactive refresh.
- `status`, `catalog`, `catalog/{id}`, `variants`, `prices` proxy routes.
- **One-click import** `POST /api/printful/import { productId }`: fetch product, **all
  variants**, prices, and **templates + printfiles for all placements**; store imagery in
  R2; persist a `products` row with `placements` (image + print area + printSpec per
  placement), `variants` (with swatches), `variant_templates` where color templates
  differ, `techniques`; create an empty `design`; return `{ productId, designId }`.
- Admin Products screen: connect state, catalog browser (client-side filter), and a
  single **Import & Design** action per product that routes straight into the editor. No
  manual image/URL step.

**Acceptance**
- Connect a real Printful account; one-click import a multi-placement product; the stored
  product has per-placement `printSpec`, the full variant list, and variant templates
  where applicable; the editor opens on the new product; token refresh works across an
  expiry.

### M3 — Composition Engine (`preview-engine`)
**Scope**
- Types (Element, Placement, SlotValues, Variant) per 05 section 3.
- Slot resolution: editable text (fit + safe area + limits), color choice, graphic choice
  (with asset recolor).
- Canvas compositor: render one placement (template bg + print area + artwork) at editor
  scale, and at full print resolution to PNG.
- Typed `ApiClient`.
- A dev harness page that composites a sample design across placements.

**Acceptance**
- The harness renders a multi-placement sample; the full-res PNG matches the on-screen
  composition; slot changes reflect immediately.

### M4 — Admin Design Studio (re-scoped by `07-admin-editor.md`)
The Composer is superseded by the **Design Studio** in 07. M4 is re-scoped around 07's
**phases** (07 §17); each phase ships together and is driven in a real browser. The earlier
M4.1–M4.10 sub-steps are folded into the phases below.

**P0 — the premium bar (ships together; anything missing still reads "cheap"):**
- **Design language** (07 §1): dark-premium skin — elevation ladder, type/space/depth scale,
  line-icon set, component kit, motion primitives (`preview-engine/tokens.css` `.theme-dark`
  + `apps/admin/src/styles.css`).
- **Living canvas** (07 §5): large staged canvas, zoom/pan, **live garment color**, elegant
  print area, soft contact shadow.
- **Direct manipulation** (07 §6): select/multi-select, marquee, **smart guides + snapping**,
  contextual floating toolbar, keyboard shortcuts, align/distribute, and **undo/redo + a
  visible history** (non-negotiable).
- **Text system** (07 §9.1–§9.3): curated **font library** with live previews, core controls,
  brand palette + full picker + eyedropper.
- **Assets** (07 §7): drag-to-canvas, search, recents, favorites; provided library (07 §8,
  Iconify whitelist + CC0 shapes).
- **Customer slots** (07 §12): one-gesture slot creation + the first-class "what the customer
  fills" panel; owner-curated offered colors.
- **Onboarding & feedback** (07 §13–§14): guided empty states, autosave, toasts with undo,
  skeletons.
- **Publishing & parity** (07 §15–§16): price/publish in **My Products**, mockups on publish;
  the storefront customizer shares the engine.

**P1 — depth & polish:** rulers/grid; font **pairings**; **gradient** fills; text effect
**lockups**; image **filters**; first-run tour; recently-used everywhere; group as a named
object; per-element opacity.

**P2 — product refinements (owner feedback):** blank-by-default canvas; **async, resilient
mockup generation** (start task → poll status, real progress); clamped panning; clean
elements (no floating label); remove templates / quick-designs / font-pairings; library
previews before search.

**P-00 — deferred:** background removal; command palette (Cmd-K); brand-kit management; design
versioning; collaboration; AI assists (auto-layout, suggest fonts/colors).

**Acceptance (M4 overall)**
- The full **P0** bar ships together and is driven in a real browser: author on a
  multi-placement product with styled text, an upload, a library graphic, live garment-color
  switching, smart-guide placement, and **undo/redo**; expose each slot type via the "what the
  customer fills" panel; **price and publish from My Products**; mockups render on publish;
  the storefront customizer matches the studio preview. P1/P2 land on top as above.

### M5 — Storefront Catalog & Product Detail
**Scope**
- Catalog page (published products, price-from), product detail (gallery, price,
  description, size + color selectors), Customize entry point.
- Public `GET /api/products`, `GET /api/products/{slug}`.

**Acceptance**
- Only published products list; product detail shows real variants; Customize opens the
  customizer for that product.

### M6 — Storefront Customizer
**Scope**
- Two-pane customizer reusing `PlacementStage` (customize mode): placement tabs, live
  preview, owner-defined slot controls, required size + color, live price.
- Add to cart persists product + variant + slot values; disabled with reason until valid.
- On-demand realistic preview (same mockup path as admin).

**Acceptance**
- Customize a product across placements, see instant preview, pick variant, add to cart;
  the saved preview equals the print-file composition; add-to-cart gating works.

### M7 — Cart & Checkout (payment deferred)
**Scope**
- Cart (client-persisted): line items with preview thumbnail, variant, personalization
  summary, qty, subtotal.
- Checkout: email + US shipping form; order summary; shipping/tax "coming soon"; Pay
  button disabled with "Coming soon"; "Save my design & notify me".
- `POST /api/orders` creates a **draft** order + items (with slot values and saved
  preview); Order Saved confirmation with reference; `GET /api/orders/{reference}`.

**Acceptance**
- Reach checkout, submit, and get a draft order + confirmation; the order and items are
  persisted correctly; no payment or Printful order is created.

### M8 — Polish, QA & Launch
**Scope**
- Responsive parity (mobile + desktop) for all screens; accessibility pass (keyboard,
  contrast, focus, touch targets, reduced motion).
- All empty/loading/error states per UI/UX section 8.
- Cross-browser check; production deploy with real domains and secrets.

**Acceptance**
- QA checklist (section 5) green on mobile and desktop; production deploy live.

## 3. Sequencing & Parallelism
```
M0 ──> M1 ──> M2 ──┐
                   ├─> M4 (admin composer)
       M3 ─────────┘        │
                            ├─> M6 (customizer)
                   M5 ──────┘
                            └─> M7 ──> M8
```
- **M3** (engine) can start right after **M0**, in parallel with **M1–M2**.
- **M4** needs M2 (imported products) + M3 (engine).
- **M5** needs M2 (published products) and can run parallel to M4.
- **M6** needs M3 + M5; **M7** needs M6.

## 4. Verification Strategy
- **Static:** `tsc --noEmit` for the Worker and both SPAs; both SPAs `vite build`.
- **Engine:** the M3 harness plus assertions that full-res PNG == preview composition.
- **Browser-driven:** headless Chromium drives the two critical flows —
  (a) admin: connect stub → import → author → publish → mockup;
  (b) storefront: customize → add to cart → checkout → order saved — with the API mocked
  where Printful credentials are unavailable, and against a live API where they are.
- **Manual QA checklist:** section 5.

## 5. Launch QA Checklist
- [ ] Admin login works on desktop and mobile; logout clears session.
- [ ] Printful connect + token refresh verified.
- [ ] One-click import of a single-placement and a multi-placement product succeeds and
      opens the editor; all variants + placements captured.
- [ ] Live garment-color / variant switching works in the editor.
- [ ] Advanced text (spacing, outline, shadow, arc) renders identically in preview and
      print file.
- [ ] Upload (PNG/JPG/SVG) with DPI warning; all-over pattern tool; background fill.
- [ ] Layers: reorder, duplicate, and duplicate-to-placement.
- [ ] Graphics library + quick designs usable.
- [ ] Each slot type (editable text, color choice, graphic choice) authorable and
      publishable.
- [ ] Storefront lists only published products; product detail variants correct.
- [ ] Customizer live preview < ~100 ms per change; placement switching correct.
- [ ] Add to cart gated by variant + text limits; reasons shown.
- [ ] Realistic mockup renders for a multi-placement product.
- [ ] Preview equals generated print file (owner spot-check vs Printful mockup).
- [ ] Checkout persists a draft order + items; confirmation shows reference.
- [ ] Pay button disabled/"Coming soon"; shipping/tax "coming soon".
- [ ] Responsive parity and accessibility pass on all screens.
- [ ] Printful token, admin passphrase, and signing key are secrets (not in repo).

## 6. Environments & Config
- **Secrets (Worker):** `PRINTFUL_CLIENT_ID`, `PRINTFUL_CLIENT_SECRET`,
  `ADMIN_PASSPHRASE_HASH`, `SESSION_SIGNING_KEY`.
- **Vars:** `ALLOWED_ORIGINS`, `ADMIN_URL`, `PRINTFUL_REDIRECT_URI`; `VITE_API_BASE` per
  SPA build.
- **Bindings:** D1 (`DB`), R2 (`BUCKET`).
- **Domains:** `abbiss` / `abbiss-admin` / `abbiss-api` (workers.dev or custom).

## 7. Explicitly Deferred (do not build now)
- Payment integration and the enabled Pay action.
- Automatic Printful order submission and order status sync.
- Customer accounts, multi-tenant/SaaS, multiple providers, multi-currency/language,
  customer artwork upload, discounts/coupons, order tracking.

## 8. Post-Launch Next Step
When KPI-4 (payment-intent clicks) justifies it, implement **payments** and then
**automatic fulfillment**, reusing the already-built draft orders and print-file
generation — the order → Printful submission path is specified but intentionally inert in
this release.
