# Abbiss POD — Product Requirements Document (PRD)

- **Product:** Abbiss — print-on-demand store with a live product customizer
- **Document:** 1 of 6 (PRD)
- **Status:** Approved for build
- **Owner:** Single operator (store owner)
- **Language of product & documentation:** English only (storefront, admin, code, database, docs)

---

## 1. Overview

Abbiss is a single-brand print-on-demand (POD) web store. Visitors browse a curated
catalog, personalize a product in a live editor that shows the result in real time on
the real product, and reach a checkout. Fulfillment is handled by Printful.

The store is operated by one person (the owner). An admin panel is used to connect
Printful, import products, define what each product lets the customer change, set the
retail price, and publish. There is no third-party seller, no customer login, and no
multi-store management in this release.

Payments and automatic order fulfillment are intentionally **out of this release** and
shown to the customer as "coming soon". Everything up to (but not including) paying is
built and functional.

## 2. Goals and Non-Goals

### 2.1 Goals
- G1 — Let a visitor personalize a product with a **real-time preview** that matches
  what will actually be printed, with **no account required**.
- G2 — Give the owner an **admin** to connect Printful, import any Printful product with
  a print template, define its customization, price it, and publish it.
- G3 — Support **any Printful product that exposes a print template**, including
  multi-placement products (front, back, sleeves) such as all-over apparel.
- G4 — Deliver a complete **guest checkout flow** that collects the order, stopping at a
  disabled "Pay (coming soon)" step.
- G5 — Use **Printful's OAuth app token model** so a future migration to multi-store /
  SaaS is a smaller step, without building any multi-tenant feature now.
- G6 — Give the owner a **rich, Printful Design Maker-class authoring editor** (upload,
  advanced text, an owner-managed graphics library, all-over pattern tools, layers,
  live garment-color switching, realistic mockups) plus a **one-click product import**
  that goes straight into that editor.

### 2.2 Non-Goals (explicitly out of this release)
- N1 — Online payments (deferred; UI shows "coming soon").
- N2 — Automatic order submission to Printful (deferred; orders are stored as drafts).
- N3 — Customer accounts, login, or saved designs.
- N4 — Multi-tenant, seller onboarding, roles, or SaaS features.
- N5 — Providers other than Printful.
- N6 — Multiple currencies or languages (US / USD / English only).
- N7 — Free-form design **for the customer**: shoppers cannot upload artwork or add
  arbitrary elements; their customization is limited to owner-defined slots. (The
  **owner/admin** has the full free-form editor — this restriction is customer-side
  only.)
- N7b — Printful's proprietary clipart library (the ~20k graphics inside their Design
  Maker) is **not** available via API and is out of scope. Our graphics/clipart and
  quick-design templates are **owner-managed content** stored in Abbiss.
- N8 — Coupons, discounts, gift cards, loyalty, reviews, wishlists.
- N9 — Order tracking, returns, or post-purchase account features.

## 3. Users and Personas

### 3.1 Owner / Admin (primary internal user)
One person who runs the store. Connects Printful, imports products, authors the
customization slots, sets prices, publishes products, and (later) manages orders.
Needs a fast path from "found a product on Printful" to "published and customizable".

### 3.2 Customer / Shopper (primary external user)
A US visitor buying personalized merch. Arrives without an account, wants to see their
personalization on the product instantly, pick size and color, and check out. Values
speed, clarity, and confidence that the preview equals the final print.

## 4. Value Proposition
- **See it before you buy it:** a real-time, print-accurate preview on the actual
  product, not a flat clipart mockup.
- **No friction:** customize and reach checkout with no sign-up.
- **Owner control:** the owner decides exactly what can be changed per product, keeping
  brand and print quality consistent.

## 5. Scope — MVP

### 5.1 In scope
| Area | Included |
|------|----------|
| Storefront | Catalog listing, product detail, live customizer, cart, guest checkout (up to payment) |
| Customer editor | Owner-defined slots: editable text, color choice, curated graphic choice; multi-placement; real-time preview |
| Admin authoring editor | Rich Design Maker-class editor: file upload, advanced text, owner graphics library, quick designs, all-over pattern tool + background fill, layers (reorder / duplicate / duplicate-to-placement), live garment-color switching, realistic mockups |
| Admin import | One-click import of a Printful product (all placements + all variants), landing straight in the editor |
| Variants | Customer selects size and color (real Printful variants) before adding to cart |
| Admin | Printful OAuth connection, authoring, slot exposure, manual pricing, publish/unpublish |
| Pricing | Manual retail price per product |
| Checkout | Guest email + shipping address, order summary, "Pay (coming soon)" |
| Data | Products, designs, assets, quick designs, orders (as drafts), Printful store token |

### 5.2 Out of scope
See Non-Goals (section 2.2).

## 6. Product Principles
1. **What you preview is what prints.** The preview and the generated print file come
   from the same composition logic.
2. **Owner-curated, not open-ended.** The customer changes only what the owner exposed.
3. **No dead ends, honest "coming soon".** The customer can complete every step that
   exists; payment is clearly marked as not yet available, never broken.
4. **Single store, SaaS-ready plumbing.** Use per-store Printful tokens, but ship zero
   multi-tenant UI or logic.
5. **English everywhere.** UI copy, admin, code, comments, database identifiers.

## 7. Functional Requirements

### 7.1 Storefront
- FR-S1 — **Catalog page** lists all published products with image, name, and price.
- FR-S2 — **Product detail** shows the product, its price, description, and a
  "Customize" entry point.
- FR-S3 — **Customizer** loads the product's print template(s) and renders a live
  preview on the real product. The customer edits the owner-defined slots and sees the
  result update in real time.
- FR-S4 — For multi-placement products, the customizer exposes each placement (e.g.
  Front, Back, Left/Right sleeve) as a switchable view.
- FR-S5 — The customer must select **size** and **color** (Printful variants) before
  the product can be added to the cart.
- FR-S6 — **Add to cart** stores the product, chosen variant, and the exact
  personalization values.
- FR-S7 — **Cart** lists items with per-item personalization summary, quantity, unit
  price, and subtotal.
- FR-S8 — **Checkout** collects customer email and shipping address, shows an order
  summary, and presents a disabled **"Pay — coming soon"** control. Shipping and taxes
  are shown as "calculated at payment (coming soon)".
- FR-S9 — On reaching checkout, the order is persisted as a **draft/quote** (not sent to
  Printful, not paid).

### 7.2 Admin
- FR-A1 — **Connect Printful** via OAuth; the store token is stored server-side and
  never exposed to the browser.
- FR-A2 — **One-click import**: from the catalog, a single action imports a product with
  **all its placements and all its variants** automatically (no manual image/URL
  picking), capturing print template(s), print-file dimensions per placement, variants
  (size/color with swatches), pricing, and imagery, then **opens the editor** on that
  product.
- FR-A3 — **Rich authoring editor** (Printful Design Maker-class, owner-only):
  - FR-A3.1 Canvas per placement with switchable **placement tabs** and **live
    garment-color / variant** switching.
  - FR-A3.2 **Upload** raster/vector artwork (PNG/JPG/SVG) with resolution/DPI warnings.
  - FR-A3.3 **Advanced text**: font, size, color, letter spacing, outline, shadow, and
    text arc/curve.
  - FR-A3.4 **Graphics library** (owner-managed clipart, categorized) and **quick
    designs** (owner-made premade element combos) to drag onto a placement.
  - FR-A3.5 **All-over pattern tool**: turn an element into a seamless pattern (half
    drop, block, brick, reflect, line) with adjustable scale, spacing, and color; plus a
    **background color/graphic fill** per placement.
  - FR-A3.6 **Manipulation**: move, scale, rotate, align; **layers** panel to reorder,
    rename, hide/lock, duplicate, and **duplicate an element to another placement**.
  - FR-A3.7 **Realistic mockups** on demand across all placements.
- FR-A4 — **Expose slots**: mark authored elements as customer-editable slots of type
  text, color, or graphic choice (see section 8). Everything not exposed is fixed.
- FR-A5 — **Set retail price** manually per product (USD).
- FR-A6 — **Publish / unpublish** a product to the storefront.
- FR-A7 — Admin access is restricted to the owner (mechanism specified in the TRD).

### 7.3 Fulfillment (deferred)
- FR-F1 — Orders are stored as drafts only. No order is submitted to Printful in this
  release. The submission path is specified but not activated (see TRD and Roadmap).

## 8. Personalization Model (Slot Types)

The owner composes a design from elements placed on a product's placements. An element
can be **fixed** (owner-set, not customer-changeable) or exposed as a **slot** the
customer controls. MVP slot types:

| Slot type | Customer action | Owner configuration |
|-----------|-----------------|---------------------|
| **Editable text** | Types text into a defined area | Label, character limit, max lines, font, color, safe area |
| **Color choice** | Picks a color from a fixed set | The list of allowed colors and the default |
| **Graphic choice** | Picks a graphic/icon from a curated set | The set of allowed graphics and the default |

Rules:
- The customer cannot upload artwork, add elements, move, resize, or restyle anything
  beyond the exposed slots.
- Every slot has a valid default so the product always previews as a complete design.
- Text is constrained to a legible safe area; over-limit input is prevented.

## 9. Product and Variant Model
- A **product** is a Printful catalog product imported into Abbiss, with its print
  template(s) and print-file dimensions per placement.
- A **variant** is a real Printful size/color combination. The customer must choose one
  size and one color to purchase.
- A **design** is the owner's composition (fixed elements + slots) for a product, plus
  its retail price and published state.

## 10. Pricing
- Retail price is **set manually per product** by the owner in the admin, in **USD**.
- No automatic markup, tiered, or dynamic pricing in this release.
- Cart subtotal = sum of (unit price × quantity). Shipping and taxes are not computed
  (shown as "calculated at payment — coming soon").

## 11. Checkout and Payments
- **Guest only.** No account. Email is required for the order record.
- Checkout collects: email, full shipping address (US), and shows the order summary.
- The **Pay** action is present but disabled and labeled **"Coming soon"**. No payment
  provider is integrated in this release.
- Reaching checkout persists the order as a **draft** for the owner's visibility.

## 12. Non-Functional Requirements
- NFR-1 **Performance:** the live preview updates within ~100 ms of a slot change on a
  typical laptop; on-demand realistic mockups may take longer and are clearly loading.
- NFR-2 **Fidelity:** the previewed composition equals the generated print file.
- NFR-3 **Security:** the Printful token lives only server-side; the admin is not
  publicly usable by anonymous visitors.
- NFR-4 **Availability:** storefront is a static-first web app backed by a serverless
  API; no server to babysit.
- NFR-5 **Localization:** US English, USD, US shipping addresses only.
- NFR-6 **Accessibility:** keyboard-operable editor controls and sufficient contrast.
- NFR-7 **Maintainability:** English identifiers and comments; one composition engine
  shared by storefront preview, admin preview, and print-file generation.

## 13. Success Metrics (KPIs)
Because payment is deferred, MVP success is measured on the funnel up to checkout and on
operator efficiency:
- KPI-1 **Customizer engagement:** % of product-detail views that open the customizer.
- KPI-2 **Editor completion:** % of customizer sessions that reach "Add to cart".
- KPI-3 **Checkout reach:** % of carts that reach the checkout summary.
- KPI-4 **Payment intent:** count of "Pay — coming soon" clicks (demand signal for
  turning on payments).
- KPI-5 **Time to publish:** median owner time from importing a Printful product to
  publishing it customizable.
- KPI-6 **Catalog size:** number of published, customizable products.
- KPI-7 **Preview accuracy:** rate of previews that match the Printful realistic mockup
  (owner spot-check).

## 14. Assumptions and Constraints
- A1 — One Printful account, one store, one operator.
- A2 — Printful exposes, per catalog product: a print template image and print-area per
  placement, print-file pixel dimensions per placement, variants (size/color), pricing,
  and an asynchronous realistic mockup generator. These are the integration's backbone.
- A3 — Market is the United States; currency USD; single language English.
- A4 — All customer-facing text, admin text, code, comments, and database identifiers
  are English.
- A5 — The Printful OAuth **app** model is used (per-store token), even though only one
  store exists, to keep a future SaaS migration cheap.
- A6 — No customer PII beyond email and shipping address is collected; no card data is
  handled in this release.

## 15. Dependencies
- D1 — Printful account with API/OAuth app credentials.
- D2 — Printful Catalog, Mockup Generator (templates, printfiles, mockup tasks), and
  Variant/Pricing APIs.
- D3 — A serverless hosting + database + object storage platform (specified in the TRD).

## 16. Post-MVP Roadmap (direction, not commitments)
1. **Payments** (turn on the deferred checkout: card + wallets).
2. **Automatic fulfillment** (submit paid orders to Printful; order status sync).
3. **Order management** in the admin (view, retry, cancel).
4. **SaaS / multi-store** (leverage the per-store token model: seller onboarding, roles,
   tenant isolation).
5. **Expanded personalization** (customer image upload, more slot types) if demand
   (KPI-4) justifies it.
