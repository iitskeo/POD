# Abbiss POD — Admin Editor (Design Studio)

- **Document:** 7 of 7 (Admin Editor) — the single source of truth for the admin.
- **Status:** Draft for review
- **Supersedes:** the Composer parts of `03-ui-ux.md §6.4` and the editor sub-steps of
  `06-implementation-plan.md §M4`. Those sections will point here once this is approved.
- **Owner language:** English only (per PRD).

This document captures the *complete* admin experience the owner wants, so no feature is
split across docs. It is written to be as close as possible to the Printful / Printify
design makers: easy to understand, complete, intuitive.

---

## 1. Admin navigation (left sidebar)

The admin is a persistent app shell with a **left sidebar**. Three destinations:

1. **My Store** — opens the live storefront (the customer site) in a new tab. A quick way
   for the owner to see what shoppers see.
2. **Create Products** — the **Design Studio**: import from Printful and design/customize
   any imported product. This is where authoring happens. *No pricing here.*
3. **My Products** — the owner's product catalog: set retail price, review, and
   **publish / unpublish**. Mockups are generated and chosen here (see §9).

> **Decision — separate design from merchandising (owner asked).**
> *Recommendation, accepted as the design:* yes, split them.
> **Create Products = design.** **My Products = price + publish.** This matches how
> e-commerce tools work (a design surface vs. a catalog/merchandising surface), keeps the
> studio uncluttered, and gives publishing one clear home. Publishing from My Products is
> what triggers mockup generation (§9).

## 2. Create Products — import + edit

Landing shows two things:
- **Import** from Printful — unchanged from today: browse the catalog, one-click
  **Import & Design**. Keep as-is.
- **Your imported products** (drafts and published) — click one to open it in the studio.

Importing pulls all placements, variants, templates and printfiles (as already built).

## 3. The Design Studio — layout

A three-zone editor, Printful/Printify-class:

- **Top bar:** product name · **placement tabs** (§6) · **garment-color/variant switch**
  (§7) · Save · Back.
- **Left rail:** the **Add & Assets** panel and the **Layers** panel (§4, §5, §8).
- **Center:** the **canvas** — the product's real template with the print area marked
  (unchanged; this is good) — plus the **live product preview** (§3.1).
- **Right:** **Properties** for the selected element (§5) and the **Customer slots**
  summary (§7).

### 3.1 Live preview — one universal, reliable view (DECIDED)

> **Decision — a single standard preview that works for every product (owner asked for
> "something standard that works").**
> The **live preview is the flat design-on-template**: the design composited inside the
> print area on the product image Printful returns for that placement. It updates in real
> time and it works for **every** product type — tumbler, mug, box, t-shirt, cap, bag —
> because it only composites the art into the print area on whatever template Printful
> gives. It never breaks on non-cylindrical shapes.
>
> This is exactly what Printful's own editor shows live while you design.
>
> **The cylinder/WebGL wrap is retired.** It only handled surfaces of revolution and broke
> on anything else (boxes, flats, caps); a fragile special-case is worse than one reliable
> view. There is no single client-side technique that renders a *photoreal* preview for
> all product shapes without per-product 3D models — which is precisely why Printful
> generates mockups on its servers.
>
> **Photoreal comes from Printful mockups** (§9), generated at publish and shown in the
> product gallery — not on every keystroke.

Honest consequence: for drinkware the live preview shows the art on the flat print
template (a print guide or product image), not wrapped around the object. The wrapped,
photoreal look is delivered by the mockups in the gallery. This is the standard,
reliable trade every POD editor makes.

The **same live preview powers the storefront customizer** (§10) — one engine, so what the
customer sees equals the studio.

## 4. Left rail — Add & Assets

The owner can add:

- **Text** — multiple fonts (§5.1).
- **Images** — upload PNG/JPG/SVG.
- **Shapes & graphics library** — a **provided library** with a **search bar** to find
  items by keyword ("car", "star", "leaf"). This is NOT Printful's proprietary clipart
  (unavailable via API — PRD N7b).

  > **Decision — source of the provided library (owner asked "is there a free one?").**
  > Yes. Back the search bar with the **Iconify API** (`api.iconify.design`): 275k+ icons
  > across 200+ open sets, with a real search endpoint that returns clean SVGs on demand —
  > exactly a searchable library, near-zero storage on our side.
  > **License caveat for POD:** Iconify mixes MIT / Apache-2.0 / CC-BY sets. Because the
  > customer *prints and sells* the result (commercial redistribution), we **whitelist
  > only permissive / CC0-friendly sets** (avoid CC-BY sets whose attribution is awkward on
  > a physical product). For clipart-style art the cleanest license is **CC0 / public
  > domain** — Openclipart and Public Domain Vectors are explicitly fine for manufacturing
  > products commercially; we can seed a CC0 pack alongside Iconify.
  > Net: **Iconify (curated safe sets) for the searchable icon/shape library, plus an
  > optional CC0 clipart pack.**
  >
  > **Initial whitelist (owner delegated the selection; licenses verified):**
  > | Set (Iconify prefix) | License | Use |
  > |---|---|---|
  > | `lucide` | ISC | Clean simple line icons |
  > | `tabler` | MIT | ~6000 line icons incl. basic shapes |
  > | `ph` (Phosphor) | MIT | Versatile icons, multiple weights |
  > | `heroicons` | MIT | Simple UI/line icons |
  > | `iconoir` | MIT | Line icons |
  > | `material-symbols` | Apache-2.0 | Icons + basic shapes |
  > | `fluent-emoji-flat` | MIT | Colorful flat emoji (popular/themed) |
  > | `noto` | Apache-2.0 | Google emoji (popular/themed) |
  >
  > Plus a small hand-made **CC0 basic-shapes pack** (rectangle, circle, triangle, star,
  > heart, arrow) so clean primitives are guaranteed.
  >
  > **License handling:** MIT/ISC/Apache need **no visible/printed attribution** (safe on
  > merchandise); we only keep a `NOTICE`/`LICENSES` file in the repo. Apache also asks
  > that modifications be documented — we serve icons unmodified, so this is satisfied.
  >
  > **Explicitly excluded (POD risk):**
  > - **`simple-icons` and any brand/logo sets** — these are company **trademarks**;
  >   printing them on merch for sale is a legal problem regardless of the icon license
  >   (the same reason we avoided programming-language logos earlier). Not offered.
  > - **CC-BY / CC-BY-SA sets** (e.g. Solar, Font Awesome, Twemoji, OpenMoji, Game Icons) —
  >   attribution / share-alike is awkward on a physical product. Not offered.
  > The owner can still upload their own art for anything outside this set.
- **Owner graphics library** — the owner's own uploaded graphics, reusable across designs.
- **Background fill** — solid color or graphic across the placement.
- **Quick designs** — the owner's saved element combos, re-applied in one click.

Searchable library requirements: each library item has a name and **tags**; the search
matches name + tags. We seed a reasonable starter set and can grow it over time.

## 5. Element properties (right panel, contextual)

Manipulation on the canvas: **move, scale, rotate, align (6-way), snapping to center,
layer order, lock, hide, duplicate, duplicate-to-placement** (already built; keep).

### 5.1 Text
Font (family list), size, color, alignment, line count, **letter spacing**, **curve/arc**,
**outline** (color + width), **shadow**. (Advanced text already built; keep and polish.)

### 5.2 Image / graphic
Replace, fit, and — for SVG graphics — **recolor parts**. Position/scale/rotate as any
element.

### 5.3 Shape / pattern
Pattern type (half-drop, block, brick, reflect, line), scale, spacing, color.

## 6. Placements (top menu) — keep current behavior

A **top menu of the product's placements** (front / back / left sleeve / right sleeve /
…). Clicking one moves the canvas to that placement; you design that space only. Element
counts per tab. This is exactly today's behavior and the owner likes it — keep.

## 7. Variants & customer slots

### 7.1 Variant colors — owner curates which are offered
Printful variants are the source. If a shirt imports with 10 colors, the **owner chooses
which colors to offer** and which to hide. **All sizes are always offered.** Offered
colors drive both the studio's garment-color switch and the storefront's color picker.
*(New: today the storefront shows every color; this adds an offered-colors setting.)*

### 7.2 Slot exposure — what the customer can and can't change

The core rule: the owner authors the design, then marks each element as **Fixed** or a
**Customer slot**. Fixed elements never change. Customer slots are what the shopper fills.

> **Decision — an intuitive, mandatory slot model (owner asked for a suggestion).**
> Model each customer-editable element as a **named slot** with a type:
> - **Text slot** — the customer types (label, max chars, lines).
> - **Image slot** — the customer picks **one** image from a set the owner defines
>   (upload several; the owner curates which are offered + a default).
> - **Color slot** — the customer picks one color from a set the owner curates.
>
> **"A design for 3 images" vs "for 1" is expressed by how many image slots exist.** Three
> separate image slots (three elements) = the customer fills three; one slot = one. A
> single slot offering "pick 1 of 10" is the "choose which of many" case. This is exactly
> the owner's mental model and needs no new concept.
>
> **Making it obvious and mandatory:**
> - A **"What the customer fills" panel** in the studio lists every slot as the shopper
>   will see it: e.g. *Front — Text "Name" (required) · Image "Pick 1 of 3" (required)*.
>   The owner sees precisely the form the customer gets. (Partly built; make it a
>   first-class summary panel.)
> - Every slot is **required by default** and carries a **default value**, so (a) the
>   design always previews complete and (b) the customer can't check out having skipped a
>   slot — Add to cart stays disabled until each required slot is chosen/confirmed.
> - Per element, one clear control: **"Customer can change this"** → choose the slot type;
>   otherwise it reads **"Fixed — the customer can't change this."** (Already the
>   direction; keep it front-and-center in the properties panel.)

## 8. Assets — owner uploads + provided library

- **Owner uploads:** the owner uploads their own images/graphics; these live in the
  owner's library and in image slots.
- **Provided library:** Abbiss ships a searchable library of shapes/patterns/graphics for
  owners to use (see §4).
- **Quick designs:** owner-saved combos.

## 9. Pricing, mockups & publishing (My Products)

- **Pricing lives in My Products**, not in the studio. Each product row has a retail price
  field, status, and edit/design links.
- **Publish** is in My Products. Publishing a product:
  1. **Auto-generates realistic mockups** (Printful) — up to **5** angles/styles. No manual
     "generate" button; it happens on publish.
  2. The owner **selects which to feature, Instagram-style**: clicking mockups picks them
     in order — the **first click is the main image (badge "1")**, the next are secondary
     ("2", "3", …), each with a numbered circle in the corner. The owner can pick **1 to 5**,
     always keeping exactly **one main**. The ordered selection (main first) becomes the
     storefront product gallery.
  3. Marks the product published; it appears in the storefront.
- **Unpublish** hides it (data retained).

## 10. Customer side — real-time preview, no mockup button

- The storefront customizer shows the **same live preview** as the studio (§3.1): instant
  composition, and for cylindrical products the wrapped-on-product render — so the shopper
  sees their name / chosen image on the real product **in real time**, the complete design.
- **Remove the customer-facing "Generate mockup" button.** Printful mockups are too slow
  to be a shopper action and shouldn't be one. The shopper relies on the real-time preview;
  the polished photoreal images are the owner-curated mockups from publish (§9), shown in
  the product gallery.

## 11. What this changes vs. the current build

| Area | Today | Target (this doc) |
|---|---|---|
| Admin nav | Composer/Products tabs | Sidebar: My Store · Create Products · My Products |
| Pricing | in the composer | in My Products |
| Publish | in the composer | in My Products, triggers mockups |
| Live preview (drinkware) | flat unwrapped guide only | + client-side wrapped preview |
| Customer mockup button | present, slow | removed; real-time preview instead |
| Variant colors | all shown to customer | owner curates offered colors |
| Shapes/patterns | none | provided searchable library |
| Slot summary | per-element toggles | + a "what the customer fills" panel |

## 12. Reconciliation with other docs (to do on approval)

- `03-ui-ux.md §6` (admin screens) → replace §6.4 Composer detail with a pointer here;
  add the sidebar nav and My Products screen.
- `04-flows.md` → update the admin flow: import → design (Create Products) → price/publish
  (My Products) → mockups on publish.
- `06-implementation-plan.md` → re-scope M4 around this doc; add the cylinder live-preview
  and provided-library items; move pricing/publish to a My Products milestone.
- `05-backend-schema.md` → add: `products.offered_variant_colors`, product `mockups`
  (generated + featured), a provided-assets/library concept with tags, and confirm image
  slots (already added in code as `ImageElement.choiceSlot`).

## 13. Open items to confirm with the owner
- Provided library: **DECIDED** — Iconify whitelist above (owner delegated) + CC0 shapes.
- Live preview: **DECIDED** — universal flat design-on-template; no cylinder engine.
- Mockups: **DECIDED** — up to 5 at publish, Instagram-style ordered selection, 1 main.

*No open items remain. The editor spec is closed and ready to reconcile into 03/04/05/06.*

## 14. Resolved decisions log
- Nav split: My Store / Create Products (design) / My Products (price + publish). ✓
- Live preview: one universal flat preview; cylinder engine retired. ✓
- Provided library: Iconify API, whitelisted to safe licenses; optional CC0 pack. ✓
- Slot model: named required slots (text / pick-image / pick-color); slot count = number
  of images the customer fills; a "what the customer fills" summary panel. ✓
- Variant colors: owner curates offered colors; all sizes always offered. ✓
- Mockups: auto-generated on publish (≤5), Instagram-style ordered pick, one main. ✓
- Customer side: real-time flat preview; the "generate mockup" button is removed. ✓
