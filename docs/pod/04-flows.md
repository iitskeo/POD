# Abbiss POD — Flows

- **Document:** 4 of 6 (Flows)
- **Status:** Approved for build
- **Depends on:** 01-prd.md, 02-trd.md, 03-ui-ux.md
- **Related:** 05-backend-schema.md

All flows reflect the locked decisions: single brand, Printful only, guest checkout,
payments and auto-fulfillment deferred ("coming soon"), curated slots, hybrid preview.

---

## 1. Customer Flow — Discover to Order Saved

```mermaid
flowchart TD
  A[Land on Catalog] --> B[Open Product Detail]
  B --> C[Click Customize -> Customizer]
  C --> D[Edit owner-defined slots]
  D --> D
  D --> E{Optional: Show realistic preview}
  E -- yes --> F[Printful mockup renders ~10s] --> D
  E -- no --> G[Select size + color]
  D --> G
  G --> H{Variant chosen AND no text overflow?}
  H -- no --> D
  H -- yes --> I[Add to cart]
  I --> J[Cart: review items, qty]
  J --> K[Checkout: email + US shipping address]
  K --> L[Order summary; shipping/tax = coming soon]
  L --> M[Pay button DISABLED -> Coming soon]
  L --> N[Save my design & notify me]
  N --> O[Order stored as DRAFT + email captured]
  O --> P[Order Saved confirmation + reference]
```

Rules enforced:
- **Add to cart** is disabled until size and color are chosen and every text slot is
  within its limit.
- The instant preview updates continuously; the realistic Printful mockup is optional and
  explicitly on demand.
- No payment occurs. Reaching checkout (or using "Save my design & notify me") persists a
  **draft** order and captures the email.

## 2. Live Preview Loop (client-side)

```mermaid
sequenceDiagram
  participant U as Customer
  participant PE as preview-engine (browser)
  participant C as Canvas
  U->>PE: change a slot (text / color / graphic) or switch placement
  PE->>PE: resolve slot values -> compose active placement
  PE->>C: draw template + print area + artwork (< ~100 ms)
  C-->>U: updated preview
```

No network call per edit. One engine renders both this preview and the print file.

## 3. Realistic Mockup (on demand, hybrid)

```mermaid
sequenceDiagram
  participant U as Customer/Owner
  participant PE as preview-engine
  participant API as API Worker
  participant R2 as R2
  participant PF as Printful
  U->>PE: Show realistic preview
  PE->>PE: render full-res print file per placement with art
  PE->>API: upload print file(s)
  API->>R2: store print-file PNG(s) (public URL)
  PE->>API: POST /api/mockup { productId, files[] }
  API->>PF: create mockup task (all placements, matched techniques)
  loop until done/timeout
    API->>PF: poll task
  end
  PF-->>API: mockup image URL(s)
  API-->>PE: URLs
  PE-->>U: show realistic mockup(s)
```

## 4. Print-File Generation (shared logic)

```mermaid
flowchart LR
  D[Design: fixed elements + resolved slot values] --> S{For each placement with art}
  S --> R[Render at full print size widthPx x heightPx @ DPI]
  R --> PNG[PNG print file]
  PNG --> UP[Upload to R2 -> public URL]
  UP --> USE[Used by: realistic mockup now; order submission later]
```

The identical composition path produces the on-screen preview and the print file
(preview == print).

## 5. Admin Flow — Login

```mermaid
flowchart TD
  A[Open Admin] --> B{Valid session cookie?}
  B -- yes --> D[Admin app]
  B -- no --> C[Passphrase screen]
  C --> E[POST /api/admin/login]
  E -- ok --> F[Set signed httpOnly cookie] --> D
  E -- fail --> C
```

Any device/operator with the passphrase logs in; the cookie authorizes admin API calls.

## 6. Admin Flow — Connect Printful (OAuth)

```mermaid
sequenceDiagram
  participant AD as Admin SPA
  participant API as API Worker
  participant PF as Printful
  AD->>API: GET /api/printful/connect
  API->>API: create + store oauth state (CSRF)
  API-->>AD: redirect to Printful authorize
  AD->>PF: authorize (owner approves)
  PF-->>API: GET /callback?code&state
  API->>API: verify + consume state
  API->>PF: exchange code for tokens
  PF-->>API: access + refresh + expiry
  API->>API: store tokens per store
  API-->>AD: redirect back (printful=connected)
```

## 7. Admin Flow — One-Click Import

```mermaid
flowchart TD
  A[Browse Printful catalog] --> B[Click Import & Design on a product]
  B --> C[POST /api/printful/import { productId }]
  C --> D[API fetches product, ALL variants, prices, templates + printfiles for ALL placements]
  D --> E[Store base imagery in R2]
  E --> F[Persist product: placements w/ printSpec, all variants w/ swatches, price ref]
  F --> G[Create empty design for the product]
  G --> H[Redirect straight into the Composer on this product as DRAFT]
```

No manual image/URL picking and no per-variant repetition: one action imports the whole
product and opens the editor.

## 8. Admin Flow — Author Design (Design Maker), Expose Slots, Publish

```mermaid
flowchart TD
  A[Composer on a product] --> P[Pick placement tab / garment color]
  P --> B{Add or edit an element}
  B --> B1[Upload file PNG/JPG/SVG]
  B --> B2[Add text: font, size, color, spacing, outline, shadow, arc]
  B --> B3[Add graphic from owner library / quick design]
  B --> B4[Pattern tool: seamless type + scale/spacing/color]
  B --> B5[Background fill: color or graphic]
  B1 --> M[Move / scale / rotate / align; Layers: reorder, duplicate, duplicate-to-placement]
  B2 --> M
  B3 --> M
  B4 --> M
  B5 --> M
  M --> S{Expose as customer slot?}
  S -- text --> S1[Editable text: label, max chars, lines]
  S -- color --> S2[Color choice: allowed colors + default]
  S -- graphic --> S3[Graphic choice: allowed set + default]
  S -- no --> FIX[Element stays fixed]
  S1 --> D
  S2 --> D
  S3 --> D
  FIX --> D
  D{Check with realistic mockup?} -- yes --> E[Generate Printful mockup all placements] --> P
  D -- no --> F[Set retail price USD]
  F --> G[Save draft] --> H[Publish]
  H --> I[Product visible + customizable in storefront]
```

Unpublish reverses step H (product hidden from storefront, data retained).

## 8b. Pattern Tool (all-over)

```mermaid
flowchart LR
  A[Select an element or upload art] --> B[Enable Pattern]
  B --> C[Choose type: half drop / block / brick / reflect / line]
  C --> D[Adjust scale, spacing, color]
  D --> E[Engine tiles it seamlessly across the placement's print area]
  E --> F[Composited live like any element; included in the print file]
```

## 9. Draft Order Creation (checkout, no payment)

```mermaid
sequenceDiagram
  participant U as Customer
  participant SF as Storefront
  participant API as API Worker
  U->>SF: submit checkout (email + address) OR "Save my design & notify me"
  SF->>API: POST /api/orders { items[], contact, shipping }
  API->>API: persist order (status = draft), items with design + variant + slot values
  API-->>SF: order reference
  SF-->>U: Order Saved confirmation
```

No Printful order is created; no charge occurs.

## 10. State Machines

### 10.1 Product status
```
draft --publish--> published --unpublish--> draft
```
- `draft`: importable/editable, not shown in storefront.
- `published`: shown and customizable in storefront.

### 10.2 Order status (MVP + reserved future)
```
draft ──(payments live, future)──> pending_payment ──paid──> submitted ──> fulfilled
                                                     └──failed
```
- **MVP:** orders never leave `draft`. The states after `draft` are reserved for the
  payments + auto-fulfillment release and are not implemented now.

## 11. Error & Edge Handling (flow-level)
- **Printful disconnected** (admin): import/mockup return a clear "Printful not connected"
  and prompt to connect.
- **Token expired:** transparent refresh + one retry; only a persistent failure surfaces
  "reconnect Printful".
- **Mockup timeout:** stop polling, show a retry hint; the instant preview remains valid.
- **Text overflow:** blocked at the field; Add to cart stays disabled with the reason.
- **Missing variant:** Add to cart disabled with the reason.
- **Product with no template:** cannot be imported for customization; excluded in the
  import UI.
- **Empty states:** catalog, cart, layers, and mockup panels each show defined copy.
