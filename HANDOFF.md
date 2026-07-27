# Abbiss POD — Session Handoff (web → local)

Snapshot to continue this work in a local Claude Code (or plain) session.
Last commit on `master`: **`f22b70d`** — "Admin: product details, editing, and base price".

---

## 1. What this project is

Abbiss is a print-on-demand storefront + admin. A merchant imports products from
**Printful**, designs them in a world-class in-browser **Design Studio**, curates
customer-editable slots, sets a retail price, and publishes to a storefront where
shoppers customize and order. One rendering **engine** powers both the studio preview
and the storefront customizer (preview = print).

Spec of record for the editor: **`docs/pod/07-admin-editor.md`** (phasing in §17).

## 2. Repo layout (npm workspaces monorepo)

```
packages/preview-engine/   Shared TS/React engine: types, compose (canvas render),
                           stage (interactive canvas), iconify, icons, api client, slots.
apps/api/                  Cloudflare Worker: REST API, Printful OAuth+import, D1, R2.
apps/admin/                Admin SPA (Vite/React 19): Studio, MyProducts, CreateProducts.
apps/storefront/           Shopper SPA (Vite/React 19): catalog, customizer, checkout.
docs/pod/                  Specs. 07 is the editor spec.
```

Node 22, npm 10. `npm install` at the root installs all workspaces.

## 3. Local development

```bash
npm install
# API (Cloudflare Worker) — needs a local D1; first time:
(cd apps/api && npm run migrate:local)      # applies migrations to a LOCAL sqlite
(cd apps/api && npm run dev)                 # wrangler dev on :8787
# Admin SPA
npm run dev -w @abbiss/admin                 # vite (default :5173/5174)
# Storefront SPA
npm run dev:storefront
```
Admin/storefront point at the production API via `.env.production`; for local, set
`VITE_API_BASE=http://localhost:8787` in a `.env.local` per app if you want to hit
local wrangler.

Type-check / build (run before every commit):
```bash
npx tsc -p apps/admin/tsconfig.json --noEmit
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/storefront/tsconfig.json --noEmit
npm run build -w @abbiss/admin
npm run build -w @abbiss/storefront
(cd apps/api && npx wrangler deploy --dry-run)   # validates the worker config
```

## 4. Deployment (Cloudflare) — handled by the owner

Everything runs on **Cloudflare Workers**, account owns D1 + R2.

| Worker | URL |
|---|---|
| `abbiss-admin` (editor) | https://abbiss-admin.kene00vargas.workers.dev |
| `abbiss` (storefront)   | https://abbiss.kene00vargas.workers.dev |
| `abbiss-api`            | https://abbiss-api.kene00vargas.workers.dev |

- **D1** database: name `abbiss`, id `3fc96303-8919-4fbb-ac51-543425e159d6`.
- **R2** bucket: `abbiss` (product photos, uploads, print files, mockups).
- **Auto-deploy** is via Cloudflare **Workers Builds** connected to this repo on `master`.
  Per-worker settings that work (monorepo pattern — do NOT use `wrangler --config`,
  the Builds env parses it wrong; `cd` into the app instead):
  - admin  → Build `npm ci && npm run build -w @abbiss/admin`  · Deploy `cd apps/admin && npx wrangler deploy`
  - store  → Build `npm ci && npm run build -w @abbiss/storefront` · Deploy `cd apps/storefront && npx wrangler deploy`
  - api    → Build `npm ci` · Deploy `cd apps/api && npx wrangler deploy` · watch `apps/api/*` + `packages/preview-engine/*`

### ⚠️ Open deploy issue (needs attention)
As of this handoff, **`abbiss-api` was not redeploying** on recent pushes (stuck on an
older build) while admin/storefront redeploy fine. Check **abbiss-api → Builds** tab for
a failed/missing build; the likely fix is the `cd apps/api && npx wrangler deploy` deploy
command (same `--config` bug we fixed on admin). Until the API redeploys, the async
mockups (O2) and the new product-detail endpoints are NOT live even though the code is on
`master`.

## 5. Database migration status

`apps/api/migrations/0010_product_details.sql` adds `base_price_cents`, `description`,
`materials`. **It was applied to the LIVE D1 manually** (dashboard console / SQL), NOT via
`wrangler d1 migrations apply`, so the `d1_migrations` tracking table may not record it.
If you later run `wrangler d1 migrations apply abbiss --remote` it may error "duplicate
column" on 0010 — either mark it applied or skip it. Local dev DB: run `npm run
migrate:local` in apps/api.

## 6. What's DONE (all on `master`)

Editor spec 07 fully built through P0, P1, and the owner-driven "official P2":

- **P0** (design language, living canvas, direct manipulation w/ undo-redo + smart guides
  + floating toolbar + multi-select, curated fonts, assets, slots, onboarding, motion) —
  plus 6 P0 polish gaps (drag-reorder layers, spacing badges, group resize, text
  weight/case/line-height, effect presets, switchable panel rail).
- **P1** — per-element opacity, gradient fills (text + bg), image filters, text lockups +
  font pairings, rulers/grid, library recents, first-run tour, groups as named objects.
- **Official P2** (owner feedback): blank-by-default canvas (removed templates/quick
  designs/empty-state auto-text), removed the floating element label, clamped canvas
  panning, library example previews, and **async mockup generation**
  (POST starts task → GET polls; no more publish timeouts).
- **Admin refinements** (latest): product **details modal** in Create Products; **edit**
  name/description/materials in My Products; non-editable **base price** beside retail.

## 7. Pending / roadmap

- **`abbiss-api` redeploy** (see §4) — first thing to verify.
- **Docs reconciliation (spec §19):** point `docs/pod/03/04/05/06` at 07.
- **P-00 (deferred, optional, "someday"):** background removal, command palette (Cmd-K),
  brand-kit management, design versioning, collaboration, AI assists.
- **Optional mockup upgrade:** if sub-second mockups are wanted later, evaluate
  **Dynamic Mockups** (PSD templates) instead of Printful's async generator.
- Full interactive QA with real admin credentials + a real Printful product.

## 8. Conventions

- **Git:** commit straight to `master`, push, owner deploys. (In the web env, commits
  used `noreply@anthropic.com`; locally use your own identity.)
- **Verify before commit:** tsc + vite build for admin & storefront; `wrangler deploy
  --dry-run` for the API. The light storefront must stay visually unchanged — the
  premium skin is scoped under `.theme-dark`; the shared engine keeps preview = print.
- **Admin passphrase:** login checks `sha256(passphrase) === env.ADMIN_PASSPHRASE_HASH`
  (a Worker secret; only the hash is stored). To reset, put a new hash:
  `node -e "console.log(require('crypto').createHash('sha256').update('NEW').digest('hex'))"`
  then set the `ADMIN_PASSPHRASE_HASH` secret on `abbiss-api`. Current known passphrase
  set during this session: `abi12` (rotate for production).

## 9. Key files to know

- `packages/preview-engine/src/stage.tsx` — interactive canvas (zoom/pan, handles,
  guides, spacing, groups, grid). Biggest file.
- `packages/preview-engine/src/compose.ts` — canvas rendering (text fit, gradients,
  filters, opacity). Preview == print.
- `packages/preview-engine/src/types.ts` — element + Product model.
- `apps/admin/src/Studio.tsx` — the Design Studio shell + property panels + history.
- `apps/admin/src/history.ts` — undo/redo.
- `apps/admin/src/{CreateProducts,MyProducts}.tsx` — catalog/import + pricing/publish.
- `apps/api/src/{index,import,printful,auth}.ts` — API, Printful import, OAuth, sessions.
