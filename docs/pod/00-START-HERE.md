# Abbiss POD — Start Here (handoff)

Read this first, then `07-admin-editor.md`. This orients a fresh session; the specs
(01–07) are the source of truth.

## What this is
A single-brand print-on-demand store: a **storefront** (customers customize + checkout,
no payment yet) and an **admin** (owner imports Printful products, designs them, exposes
customer-editable slots, prices, publishes). Fulfillment via Printful. English only.

## Repo & stack
- Monorepo (npm workspaces): `apps/storefront`, `apps/admin`, `apps/api` (Cloudflare
  Worker), `packages/preview-engine` (shared: composition engine, types, `ApiClient`,
  `PlacementStage` React component).
- Stack: React 19 + Vite SPAs; Cloudflare Workers + D1 + R2; Printful (Catalog v2, Mockup
  Generator, OAuth).
- GitHub: `https://github.com/iitskeo/POD` (private), branch `master`.

## Deployed (Cloudflare account kene00vargas@gmail.com)
- Storefront: https://abbiss.kene00vargas.workers.dev
- Admin: https://abbiss-admin.kene00vargas.workers.dev
- API: https://abbiss-api.kene00vargas.workers.dev
- D1 `abbiss` (id `3fc96303-8919-4fbb-ac51-543425e159d6`), R2 `abbiss`.

## Secrets (never in the repo)
- Worker secrets already set: `PRINTFUL_CLIENT_ID`, `PRINTFUL_CLIENT_SECRET`,
  `ADMIN_PASSPHRASE_HASH`, `SESSION_SIGNING_KEY`.
- Local dev needs `apps/api/.dev.vars` (gitignored) with `PRINTFUL_CLIENT_ID=` and
  `PRINTFUL_CLIENT_SECRET=`. NOTE: the existing file was written with a UTF-8 BOM — strip
  it (`sed '1s/^\xEF\xBB\xBF//'`) when reading values in scripts.
- Admin login is a passphrase → hashed in `ADMIN_PASSPHRASE_HASH`. The owner holds the
  passphrase; rotate with `wrangler secret put ADMIN_PASSPHRASE_HASH` (SHA-256 hex of a
  new passphrase). Printful is connected (OAuth token in the `stores` table).

## Local dev / deploy
```bash
npm install                                   # from repo root (approve esbuild scripts if prompted)
# API (needs apps/api/.dev.vars):
cd apps/api && npx wrangler dev                # or deploy: npx wrangler deploy
# SPAs (VITE_API_BASE is in each app's .env.production):
npx vite build apps/storefront && (cd apps/storefront && npx wrangler deploy)
npx vite build apps/admin      && (cd apps/admin      && npx wrangler deploy)
# D1 migrations (0001–0008 already applied local + remote):
cd apps/api && npx wrangler d1 migrations apply abbiss --local   # and --remote
```
Verify flows in a real browser (the in-app Chromium screenshot tool is flaky; drive via
DOM/`javascript_tool` and cache-bust GETs with `?_=Date.now()` + `cache:'no-store'`).

## Where the build is
M0–M8 of `06-implementation-plan.md` are **built, deployed and verified**, plus slot polish
(curated color sets; image-choice on uploads). The whole customer + admin flow works end
to end today.

## What's next (the reason for the new session)
**Rebuild the admin editor to `07-admin-editor.md`** (the closed, authoritative editor
spec). Headline changes vs. what's live now:
- Sidebar nav: **My Store · Create Products (design) · My Products (price + publish)**.
- **One universal flat preview** (design-on-template); the cylinder/WebGL engine is retired.
- **Provided searchable library** via the Iconify API, whitelisted to POD-safe sets (see
  §4 of 07), plus a CC0 shapes pack.
- **Owner-curated variant colors** (all sizes always offered).
- **Named required slots** (text / pick-image / pick-color) + a "what the customer fills"
  summary panel; slot count = number of images the customer fills.
- **Mockups generated on publish** (≤5), Instagram-style ordered selection (first = main);
  the **customer "generate mockup" button is removed** in favor of the real-time preview.

Then reconcile 03/04/05/06 to point at 07 (they still describe the older editor).

## Test data to clean before a real catalog
Three published test products (`printful-12-598` tee with test elements + two test image
squares, `printful-632-16046` Wine Tumbler, `printful-274-9039` tote) and a draft order
`ABB-1AA23`. Delete/reset when starting the real catalog.
