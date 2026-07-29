# Abbiss POD — Realistic preview: live garment color, listing mockups, schematic products

- **Document:** 9 (Realistic preview) — plan / proposed. Analysis first, then changes.
- **Depends on:** 07-admin-editor.md (§5 living canvas), 08-my-store.md.
- **Owner language:** English only.

Three storefront problems the owner reported, one shared root cause.

---

## 1. Analysis (what's actually happening)

### 1.1 Root cause (shared)
Printful gives us **two different images**, and we currently only use the first:
- A **design template** — a flat, **color-agnostic, design-less** image used to *position* the
  print (for the Gildan tee: one white "ghost" shirt on a white background, `…whitebg.png`).
- A **rendered mockup** — a realistic product photo **with the design and the real garment
  color**, produced by the async mockup generator (slow; today only made at publish).

The live preview (studio + customizer) is built on the **design template**, so it can never
show the real garment color or a realistic product on its own.

### 1.2 Issue 1 — picking a color doesn't recolor the garment
Verified against the live data: the tee has **204 variants** but its design template is **one
white image, identical for every color** (`variantTemplates` collapses to a single
`…whitebg.png`). The customizer *does* swap `variantTemplates[variantId]` by color — but every
color maps to the same white template, so nothing changes. **Printful does not provide
per-color design templates** for DTG; color only exists in the rendered mockup.
→ To recolor live we must **tint the garment ourselves, client-side.**

**Feasibility (confirmed):** the Printful CDN returns `Access-Control-Allow-Origin: *`, so we
can load its images with `crossOrigin` and read pixels (`getImageData`) without tainting the
canvas. That unlocks a standard "tint a neutral garment" technique:
1. Flood-fill from the image corners to mark the pure-white **background** → a clean garment
   mask (robust even when the garment is near-white).
2. **Recolor** the garment by the variant's `colorCode`, preserving its own shading/folds
   (multiply luminance), and set the background to transparent so the stage shows through.
3. Composite the **design** on top in the print area (already done today).

This is real-time, cached per (template, color), and works for any garment whose template is a
neutral photo (DTG, embroidery, etc.). It does **not** help schematic templates (§1.4).

### 1.3 Issue 2 — the catalog/landing card shows a blank shirt, not the design
The card uses `productPhotoUrl` (the blank Printful base photo). The published tee **already
has a featured mockup** (`mockups.featured` = 1) that shows the design on the product — the
card just doesn't use it. Easy win.

### 1.4 Issue 3 — "schematic-only" products (all-over / knit / cut-sew)
For these (e.g. the knitted sweater), Printful's design template is a **flat technical
schematic**, not a garment photo. Tinting or compositing onto it will never look like the real
product, so the customer can't see a realistic preview. It genuinely needs a **rendered
mockup** to look real.

**Correction (verified):** Printful **can** mock these up — product 860 (knit) returns valid
mockup styles ("Front / Flat" #25909, "Back / Flat" #25917, …) with matching placement names
and `technique: knitting`. Our earlier "this class can't be auto-mocked" was too pessimistic.
So the reason our storefront shows no mockup for the sweater is simply that **mockups are only
generated at publish and the sweater is still a draft** (never generated) — not that it's
impossible. → **Route A below is viable with no new vendor.** The only real limit is that a
Printful mockup is **static** (owner's design), so it can't reflect the shopper's exact live
text; that needs Dynamic Mockups (Route B).

---

## 2. Proposed changes

### 2.1 A shared "garment compositor" in `preview-engine` (serves 1 and 2)
One new capability, used by both apps: given a template image + a garment color + the design,
produce a **recolored garment with the design composited** on a transparent background
(client-side, CORS pixel access, cached).
- **Studio + Customizer:** the live preview recolors in real time as the color changes (§1.2),
  layered with the existing fabric-shading pass. Fixes **Issue 1** for photo-template garments.
- **Thumbnails:** the same compositor renders a small design-on-garment image for cards.

Honest limits: relies on a neutral garment-on-white template (true for DTG/embroidery). The
mask is heuristic (flood-fill from corners); we tune tolerance. Preview-only — the print file
is untouched.

### 2.2 Catalog / listing card (Issue 2)
Card image priority: **(a)** `mockups.featured[0]` if the product has one → the owner-curated
realistic mockup with the design; **(b)** else the client **garment-compositor thumbnail**
(design on the recolored garment); **(c)** else the blank base photo. So a published product
always shows *something with the design*, immediately.

### 2.3 Schematic products (Issue 3) — pick a route (§4 decision)
These need a rendered mockup to look real. Options, cheapest first:
- **A — Per-color mockups at publish (Printful, no new vendor).** When publishing, generate a
  realistic mockup **per offered color** (owner's design), store them keyed by color. The
  customizer shows the mockup matching the shopper's chosen color as the "realistic preview"
  (alongside the flat live preview for their exact text). Not live-per-keystroke, but real
  product + real color. Reuses today's async mockup pipeline; heavier publish step.
- **B — Dynamic Mockups (new vendor, live-ish).** PSD smart-object render that reflects the
  shopper's **exact** customization + color in ~0.5–1s (debounced). Realistic for *all*
  products incl. knit. Paid per render + one PSD mapped per product. The "best" but the
  biggest lift.
- **C — Accept the limit for now.** Keep the flat schematic for these + the owner's static
  featured mockups; revisit later.

Recommendation: **2.1 + 2.2 now** (fixes the common DTG case end-to-end, no vendor), and for
§2.3 start with **A** (per-color Printful mockups) unless we want to commit to Dynamic Mockups.

---

## 3. Phasing
- **P1 (no vendor):** garment compositor (§2.1) → live color in studio + customizer; listing
  cards use mockup→composite→photo (§2.2).
- **P2:** schematic products route (§2.3 A or B, per §4).

---

## 4. Decisions (RESOLVED)
- **Q1 — Issue 1 → client-side garment tinting.** ✓ (CDN CORS confirmed.)
- **Q2 — Issue 2 card → featured mockup if present, else live composite, else photo.** ✓
- **Q3 — Issue 3 → Route A (Printful mockups per color).** ✓ Printful supports mockups for
  this class (verified). Generate per offered color at publish and show the one matching the
  shopper's color as the realistic preview. Static (owner's design); Dynamic Mockups (Route B)
  stays the future upgrade for live-exact.
- **Q4 — Tint scope → automatic** for any product with a neutral photo template; tune the
  mask/tolerance if a template tints badly. ✓

## 5. Build order
- **P1a — Garment compositor** in `preview-engine`: load template (crossOrigin), flood-fill
  white bg → mask, recolor garment by variant `colorCode` preserving shading, transparent bg;
  cache per (template,color). Wire into the studio + customizer live preview (Issue 1) and a
  thumbnail helper. Verify: picking a color recolors the tee live.
- **P1b — Catalog/listing card** (Issue 2): image = `mockups.featured[0]` → composite → photo.
- **P2 — Per-color mockups** (Issue 3): at publish, generate one mockup per offered color;
  store `mockups.byColor`; the customizer shows the color-matched mockup. Make generation
  reliable for knit/all-over (the async job + clear errors already exist); it may be slower for
  this class, so keep it off the blocking path.
