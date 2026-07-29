# Abbiss POD — Payments (PayPal)

- **Document:** 10 (Payments) — plan / proposed. Analysis done; awaiting go + credentials.
- **Depends on:** 04-flows.md (§9 draft orders, §10.2 order states), 05-backend-schema.md.
- **Decision:** **PayPal**. Merchant receives in **Costa Rica**; buyers are mostly **US**.
  Stripe is ruled out — no payouts to Costa Rica. Paddle/Lemon Squeezy ruled out — they don't
  do physical goods.

---

## 1. Principles
- **Hosted / no card data.** We never see or store card numbers. PayPal handles the payment
  UI; we only create an order, capture it, and confirm via webhook. Zero PCI burden.
- **Server owns the amount.** The Worker computes the charge from the **stored order**, never
  from the client — the client can't tamper with the price.
- **Works on Cloudflare Workers.** Everything is REST over `fetch` (OAuth token, Orders v2,
  webhook verify). No Node-only SDK.
- **Currency: USD** (US buyers; a CR PayPal account can receive USD).

## 2. Flow
```
Checkout (email + US shipping already captured)
  -> PayPal Smart Button (PayPal JS SDK, client)
     -> createOrder:  POST /api/pay/paypal/create { orderRef }
          server: look up our order, compute amount, create PayPal order (Orders v2), return id
     -> buyer approves in the PayPal popup (card as guest, or PayPal balance)
     -> onApprove: POST /api/pay/paypal/capture { orderRef, paypalOrderId }
          server: capture the PayPal order, verify amount+currency, mark our order PAID
  -> Order Saved / confirmation
Webhook (defensive, source of truth):
  POST /api/webhooks/paypal  (PAYMENT.CAPTURE.COMPLETED)
     server: verify signature, mark order PAID (idempotent) if not already
```
- **Smart Buttons** (PayPal JS SDK) is the simplest, standard UX: the button renders on our
  checkout, opens PayPal's popup, and calls our two endpoints. No redirect page to build.
- Capture happens **server-side** so we control amount verification and order state.

## 3. Backend (Worker)
New endpoints:
- `POST /api/pay/paypal/create` — `{ orderRef }` -> `{ paypalOrderId }`. Loads the order,
  rejects if not `draft`/`pending_payment`, builds the amount from stored line items, calls
  Orders v2 create. Sets order `pending_payment`.
- `POST /api/pay/paypal/capture` — `{ orderRef, paypalOrderId }` -> captures, verifies the
  captured amount == our amount and currency == USD, sets order `paid`, stores capture id.
- `POST /api/webhooks/paypal` — verifies the webhook signature against `PAYPAL_WEBHOOK_ID`,
  marks `paid` idempotently. This is the real source of truth (handles a dropped client).
Helpers: OAuth `client_credentials` token (POST /v1/oauth2/token, cached ~8 min); base URL
switches sandbox/live by `PAYPAL_ENV`.

**Secrets / vars (Worker):**
- `PAYPAL_CLIENT_ID` (also sent to the client to load the SDK), `PAYPAL_CLIENT_SECRET`,
  `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV` = `sandbox` | `live`.
- Expose the client id to the storefront via a small public config route or a build-time var.

## 4. Order model (migration)
`orders` today: draft only. Add columns: `payment_provider` ('paypal'), `paypal_order_id`,
`paypal_capture_id`, `paid_at`. Reuse the existing status machine (04 §10.2):
`draft -> pending_payment -> paid`. (`submitted`/`fulfilled` stay reserved for §6.)

## 5. Storefront
- Checkout: keep email + US shipping capture. Replace the disabled **"Pay — coming soon"**
  with the **PayPal button**. On success -> Order Saved with the reference + paid state.
- Cart/summary unchanged; the amount shown must match the server's computed amount.

## 6. Auto-fulfillment to Printful (IN SCOPE — owner chose payment + auto-submit)
After an order is `paid`, automatically create the order in Printful so it fulfils without
manual work. Runs **after capture** (and is retried from the webhook if needed), off the
buyer's request path.
- **Printful Orders API** (v2 `POST /orders`) with `confirm: false` first (a draft in
  Printful that does **not** charge) during sandbox/testing, then `confirm: true` for live so
  it goes to production automatically.
- **Mapping** per order item: Printful `catalog_variant_id` (from our stored variant), the
  **print file(s)** per placement (we already render + upload these — reuse the publish path),
  and the buyer's **US shipping address** (already captured at checkout).
- **Idempotent**: store `printful_order_id` on our order; never submit twice. On success set
  status `submitted`; surface Printful errors to the owner (an order can be `paid` but
  `fulfillment_failed`, retried).
- **Money reality:** confirming a Printful order **charges the merchant** their base cost +
  shipping. Sandbox uses `confirm: false` (no charge) to validate mapping; live flips to
  confirm.

## 7. Sales tax / VAT (not now)
PayPal is not a Merchant of Record; it won't handle US sales tax. Fine at low volume; revisit
if nexus thresholds are crossed. Not a code blocker.

## 7. Build order
- **P1 — Sandbox end to end.** Migration; the three endpoints + token helper; the storefront
  button; test a full sandbox purchase (create -> approve -> capture -> webhook -> order paid).
- **P2 — Go live.** Swap to live credentials/secrets, register the live webhook, smoke-test a
  real small purchase, then enable.

## 8. What I need from you (accounts — I can't create these)
1. A **PayPal Developer app** (start in **Sandbox**): gives `Client ID` + `Secret`. Create at
   developer.paypal.com. Later a **Live** app for production.
2. A **webhook** on that app pointing to `https://abbiss-api.kene00vargas.workers.dev/api/webhooks/paypal`,
   subscribed to `PAYMENT.CAPTURE.COMPLETED` -> gives the `Webhook ID`.
3. You set these as Worker secrets (I'll give the exact `wrangler secret put` commands).

## 9. Open decisions
- **Q1** — Sandbox first (recommended) then live, or straight to live?
- **Q2** — This phase = payment only (fulfill manually), or also wire auto-submit to Printful
  now? (Recommended: payment only first.)
- **Q3** — Button placement: PayPal Smart Button only, or also show a plain card field
  (PayPal "Advanced" card fields need extra approval/PCI SAQ — recommend **buttons only**).
