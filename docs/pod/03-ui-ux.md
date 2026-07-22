# Abbiss POD — UI/UX Specification

- **Document:** 3 of 6 (UI/UX)
- **Status:** Approved for build
- **Depends on:** 01-prd.md, 02-trd.md
- **Related:** 04-flows.md

---

## 1. Design Direction

Editorial / industrial minimal with clean commercial touches. Abbiss identity, but
**light-forward and open**, not heavy-dark:

- **Storefront:** light-forward. Off-white canvas, white cards, generous whitespace,
  large display type, a visible grid, one orange accent, monospaced micro-labels. Dark
  blocks are used sparingly for editorial emphasis (hero band, footer).
- **Admin:** darker "industrial tool" surface (carbon) for a focused, utilitarian feel.
- **One accent, always.** Signal orange marks the single most important action or state
  in any view — never two competing accents.

## 2. Design Tokens

### 2.1 Color
| Token | Hex | Use |
|-------|-----|-----|
| `--ink` | `#0A0A0A` | Primary text; editorial dark blocks |
| `--carbon` | `#161616` | Dark surfaces; admin base |
| `--bone` | `#F5F5F0` | Storefront page background |
| `--surface` | `#FFFFFF` | Cards, inputs, canvases (light) |
| `--mist` | `#E4E4DC` | Hairlines, subtle fills on light |
| `--signal` | `#FF5A1F` | Single accent: primary CTA, active state, focus |
| `--line` | `color-mix(ink 12%, transparent)` | Borders on light; on dark use bone 12% |
| `--muted` | `color-mix(ink 55%, transparent)` | Secondary text on light |

Contrast: body text on `--bone`/`--surface` uses `--ink`; on dark surfaces uses
`--bone`. All text/background pairs meet WCAG AA.

### 2.2 Typography
| Role | Family | Weight | Notes |
|------|--------|--------|-------|
| Display / headings | Space Grotesk | 700 / 500 | Tight tracking (-0.02 to -0.03em) |
| Body / UI | Inter | 400 / 500 / 600 | Line-height 1.5 body |
| Data / labels ("eyebrows"), price, specs | IBM Plex Mono | 500 | Uppercase, letter-spacing 0.06–0.14em, 10–12px |

Type scale (clamped for responsive): Display `clamp(2rem, 5vw, 3.5rem)`, H1 2rem, H2
1.5rem, H3 1.125rem, Body 1rem, Small 0.875rem, Micro 0.625–0.6875rem (mono labels).

### 2.3 Spacing, Radius, Elevation, Motion
- **Spacing scale (px):** 4, 8, 12, 16, 20, 24, 32, 40, 64.
- **Radius:** 3px default (sharp/industrial); pills only for count badges.
- **Borders:** 1px hairlines (`--line`); no heavy shadows. Light cards use hairline +
  optional 1–2px soft shadow for lift on the commercial surfaces.
- **Motion:** 160ms ease for hover/selection; hover lifts controls `translateY(-2px)`;
  respect `prefers-reduced-motion`.
- **Texture (optional, subtle):** faint halftone dot pattern (≤14% opacity) on stage
  backgrounds only, as a nod to print craft. Never behind text.

## 3. Layout System
- **Grid:** 12-column fluid, max content width ~1100px, 24px gutters.
- **Breakpoints:** mobile ≤ 640px, tablet 641–1024px, desktop ≥ 1024px. Both mobile and
  desktop are first-class (equal investment).
- **Two-pane pattern** (editor & admin composer): side-by-side on ≥ 1024px, vertically
  stacked on smaller screens (canvas first, controls below).

## 4. Component Inventory
- **Buttons:** `cta` (signal-filled, primary action), `btn` (hairline secondary),
  `ghost`/`mini` (icon/inline). Disabled = 40% opacity, no pointer. "Coming soon"
  buttons render disabled with a mono "Coming soon" tag.
- **Inputs:** text field, number field, textarea; hairline border, signal focus ring.
- **Swatches:** color squares; selected = signal outline; small variant for defaults.
- **Icon/graphic tiles:** square tiles for graphic-choice slots; selected = signal
  border + tint.
- **Tabs:** placement tabs (with element-count badge), admin section tabs.
- **Cards:** product card (image, name, price), cart line card.
- **Eyebrow / chip:** mono uppercase micro-label above sections.
- **Toolbar:** grouped actions (admin add-element; not shown to customers).
- **Feedback:** inline hint (mono, `data-warn` turns signal), loading text with elapsed
  seconds for async mockups, non-blocking toasts for admin save/publish.
- **Empty states:** every list/preview has a defined empty message.

## 5. Storefront Screens

### 5.1 Header (global)
- Left: **Abbiss** wordmark (Space Grotesk). Right: Cart with item count.
- Light surface, hairline bottom border. Sticky on scroll.

### 5.2 Catalog / Home
- Optional editorial **hero band** (dark block, display headline, one CTA) — used
  sparingly.
- **Product grid** (light cards): product image on `--surface`, name, and price
  (`from $X` in mono). 2 cols mobile, 3–4 desktop. Hover lifts the card.
- Only **published** products appear.

### 5.3 Product Detail
- **Left:** product gallery (base imagery / mockup).
- **Right:** name (display), price (mono), short description, and a primary **Customize**
  CTA. Variant hint (e.g., "Sizes S–3XL · N colors").
- Customize routes to the Customizer for that product.

### 5.4 Customizer (core screen) — two-pane
**Left (stage):**
- Placement **tabs** above the canvas (Front / Back / Left sleeve / Right sleeve …),
  each with a small count badge when it carries art.
- Large **canvas**: the real product template with the print area marked and the live
  composition inside it. Updates in real time (< ~100 ms) as slots change.
- Below: a mono caption ("Anything outside the dashed area is not printed").

**Right (controls), grouped top-to-bottom:**
1. **Variant:** size selector (required) and color selector (required). Both must be set
   before Add to cart enables.
2. **Personalize:** the owner-defined slots, each labeled:
   - *Editable text* → text field with live character counter and safe-area warning.
   - *Color choice* → swatch row.
   - *Graphic choice* → icon/graphic tile row.
3. **Realistic preview:** a "Show realistic preview" button that renders the current
   design on the real product via Printful (async, shows elapsed seconds; result appears
   as image(s)). Clearly optional and separate from the instant preview.
4. **Price** (mono) and **Add to cart** (`cta`). Disabled until variant is chosen and no
   text slot is over its limit; disabled reason shown as a hint.

Mobile: stage on top, controls stacked below; placement tabs remain above the canvas;
Add to cart sticks to the bottom.

### 5.5 Cart
- Line items: thumbnail of the customized preview, product name, variant (size/color),
  a compact personalization summary, quantity stepper, unit price, line total.
- Order **subtotal** (mono). Shipping & taxes line reads "calculated at payment — coming
  soon". Primary **Checkout** CTA.
- Empty cart state with a link back to the catalog.

### 5.6 Checkout (guest, payment deferred)
- **Contact:** email (required).
- **Shipping address:** US address form (name, address 1/2, city, state, ZIP).
- **Order summary:** items + subtotal; shipping/taxes "coming soon".
- **Pay** button rendered **disabled** with a "Coming soon" tag. Below it, a secondary
  action **"Save my design & notify me"** persists the order as a draft and captures the
  email for a launch notification.

### 5.7 Order Saved (confirmation)
- Confirmation panel: "Your design is saved. Payments are coming soon — we'll email you
  when you can complete this order." Shows an order reference and the saved preview.

## 6. Admin Screens (dark industrial tool)

### 6.1 Login
- Centered card on carbon: single passphrase field + Enter. Error hint on failure.
  Session persists via cookie across devices.

### 6.2 Top bar
- Brand, section tabs (**Composer**, **Products**), current product selector, design
  name field, save/publish actions, status hint.

### 6.3 Products / Import (one-click)
- **Connect Printful** state (connected store name or a Connect button).
- **Catalog browser:** searchable/filterable grid of Printful products (client-side
  filter over the full catalog), each card with image, name, brand, and price-from.
- **One-click Import:** a single **Import & Design** action on a product imports it
  fully — **all placements and all variants** (color swatches + sizes), templates,
  print-file sizes, and pricing — with **no manual image/URL step**, then routes straight
  into the Composer for that product.
- **Imported products list:** status (draft/published), quick links to edit or view.

### 6.4 Composer — Design Maker (three zones)
A Printful Design Maker-class authoring surface, owner-only. Dark industrial tool skin.

**Top bar:** product name, **placement tabs** (Front / Back / sleeves…), **garment color
/ variant switcher** (updates the base live), Save draft, Publish, and a **Mockups**
action.

**Left rail — Add & Layers:**
- **Add:** Upload file, Add text, Graphics (owner library, by category), Quick designs
  (owner premade combos), Pattern (all-over), Background fill.
- **Layers:** list of elements on the active placement — drag to reorder, rename,
  hide/lock, duplicate, and **duplicate to another placement**.

**Center — Stage:**
- `PlacementStage` in **author** mode: template photo for the active placement, print
  area marked, artwork composited live. Move / scale / rotate / align with snapping
  guides. A contextual **property bar** appears above the selected element.

**Right — Properties (contextual to selection):**
- **Text:** font, size, color, letter spacing, outline, shadow, arc/curve; plus slot
  config (make editable, character limit, max lines, label).
- **Graphic:** replace graphic; slot config (graphic-choice set + default); color-part
  recolor options + default.
- **Pattern:** pattern type (half drop / block / brick / reflect / line), scale, spacing,
  color.
- **Background:** color or graphic fill for the placement.
- **Slot exposure:** a per-element "customer-editable" toggle turns a fixed element into
  a slot of the matching type (text / color / graphic).
- **Product:** retail price (USD); Publish / Save draft.

**Graphics/Assets manager:** a section to upload and categorize the owner's graphics
(SVG/PNG, with recolor parts) and to save **quick designs** for reuse. This library is
owner content — it is not Printful's proprietary clipart.

## 7. Content & Microcopy Rules
- All copy in **US English**.
- Prices in USD with `$` and mono styling.
- "Coming soon" is the exact phrase for deferred payment/fulfillment.
- Hints are short, lower-stress, and mono; warnings turn signal-colored.

## 8. States & Feedback (must be defined everywhere)
- **Loading:** skeletons for catalog; elapsed-second text for async mockups.
- **Empty:** catalog, cart, layers, mockup — all have copy.
- **Error:** inline, human-readable; Printful errors surfaced plainly.
- **Disabled:** Add to cart (missing variant / text overflow), Pay (coming soon) — always
  with a reason.
- **Success:** admin save/publish toast; storefront "order saved" panel.

## 9. Accessibility
- Full keyboard operation of editor controls; visible signal focus ring.
- Selected/active states not conveyed by color alone (also outline/badge).
- Touch targets ≥ 40px on mobile; drag handles enlarged on touch.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` where the light/dark split
  applies (storefront light, admin dark are intentional and fixed).
- Alt text on product and mockup images.

## 10. Iconography & Imagery
- Minimal line icons; graphics for slots are the owner's uploaded set (SVG/PNG).
- Product imagery comes from Printful (base photo) and Printful mockups (realistic
  preview). The instant preview is the canvas composition.

## 11. Responsive Behavior Summary
| Screen | Mobile (≤640) | Desktop (≥1024) |
|--------|---------------|------------------|
| Catalog | 2-col grid | 3–4-col grid |
| Product detail | Stacked (gallery, info) | Two columns |
| Customizer | Stage top, controls below, sticky Add to cart | Two-pane, controls right |
| Cart / Checkout | Single column | Summary aside |
| Admin composer | Stacked panels | Three-zone (palette, stage, properties) |
