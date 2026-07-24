# Abbiss POD — Design Studio (Admin Editor)

- **Document:** 7 of 7 (Admin Editor) — the single source of truth for the admin.
- **Status:** Rewritten to a world-class bar. Supersedes the earlier feature-list draft.
- **Supersedes:** the Composer parts of `03-ui-ux.md §6.4` and the editor sub-steps of
  `06-implementation-plan.md §M4`. Those sections point here.
- **Owner language:** English only (per PRD).

This document specifies a design studio that competes with the best print-on-demand and
graphic makers (Printful, Printify, Kittl, Canva, Placeit). The previous draft listed
*features*; it said nothing about how the tool **feels** — which is exactly why the built
result read as cheap, dead and rigid. This rewrite fixes that: it specifies the
**experience** (visual language, direct manipulation, motion, onboarding) alongside the
features, and organizes everything into phases so it is aspirational *and* buildable.

Two foundational decisions frame the whole document (owner-approved):

- **Visual direction: dark premium** — keep Abbiss's dark DNA, executed like a luxury
  product (Linear / Framer grade), not a dark dev tool.
- **Live preview: elevated-flat** — the live preview stays the flat design-on-template (it
  works for every product and never breaks), but presented as a *living canvas* (large,
  zoomable, real product photo, live garment color, soft staged shadow). Photoreal comes
  from Printful mockups in the gallery at publish. No client-side 3D.

---

## 0. Product thesis & design principles

**Thesis.** A first-timer makes something that looks *designed* in under a minute, and a
power user never hits a wall. The studio should feel calm, fast, and alive — every action
has an obvious result, nothing is scary, and the product on screen looks real.

**Principles** (these are the rubric; every screen is judged against them):

1. **The canvas is the hero.** The product fills the center, large and uncluttered. Panels
   serve the canvas; they never crowd it.
2. **Direct manipulation over forms.** You change things by grabbing them on the canvas —
   drag, scale, rotate, recolor in place. Property panels are for fine-tuning, not the
   primary way to work.
3. **Nothing is destructive.** Every action is undoable. A visible history and instant
   undo/redo remove all fear from experimenting. **This is non-negotiable.**
4. **Defaults that look designed.** Every new text/shape/color lands with tasteful defaults
   (font, size, weight, spacing, color) so the first placement already looks good.
5. **Progressive disclosure.** Simple by default; power on demand. Advanced controls are one
   reveal away, never in your face.
6. **Motion with meaning.** Selection lifts, panels slide, saves confirm, values animate.
   Motion communicates state and makes the tool feel physical — never decorative lag.
7. **Parity.** The studio's live preview and the storefront customizer are the *same
   engine*. What the owner designs is exactly what the shopper sees.

**Non-negotiable P0 bar** (if any of these is missing, it still feels cheap): undo/redo,
smart alignment guides + snapping, autosave, the dark-premium design language, the living
canvas (zoom + live garment color), a real font system, and start-from-template.

---

## 1. Design language — dark premium

The single biggest cause of "looks cheap" is the current skin: carbon background, 10px mono
labels, tiny swatches, uppercase eyebrows — a dev panel, not a creative product. This
section defines the system that replaces it. It is the 50% fix on its own.

### 1.1 Color & elevation
Dark, but **layered**, not flat-black. Depth comes from stacked surfaces with hairline
borders and soft shadows, never from heavy lines.

- **Surfaces (elevation ladder):** `bg` (app base, near-black warm), `surface-1` (panels),
  `surface-2` (cards, popovers), `surface-3` (floating toolbar, menus). Each step ~4–6%
  lighter, each with a 1px top-highlight border and a soft ambient shadow below.
- **Text:** `text-1` (primary, high contrast), `text-2` (secondary), `text-3` (tertiary /
  hints). Retire 10px mono as body text; hints are readable 12–13px.
- **Accent:** Abbiss orange as the single action/selection accent. Used sparingly — for the
  primary CTA, the current selection, and active nav. Not decoration.
- **Semantic:** success (green), warning (amber), danger (red), info (blue) — muted for dark.
- **Selection accent** is orange with a soft outer glow; it is the one color that always
  means "this is what you're acting on."

### 1.2 Typography
Three roles: **Display** (screen titles, product name), **UI** (all interface text —
comfortable 13–14px, medium weight), **Mono** (only for ids/dimensions/technical readouts).
A defined type scale (e.g. 11 / 12 / 13 / 14 / 16 / 20 / 28) with consistent line-heights.
No text smaller than 11px anywhere.

### 1.3 Space, radius, depth
- **Spacing** on a 4px grid; panels breathe (16–20px padding, generous gaps). Cramped 6px
  grids are gone.
- **Radius** scale: controls 8px, cards 12px, modals 16px. Consistent, soft.
- **Depth:** every raised surface gets a subtle shadow + top-highlight. This is what makes
  dark look premium instead of dead.

### 1.4 Iconography
One consistent line-icon set for all UI chrome (Lucide — already whitelisted). No emoji as
UI glyphs (the current ↑↓🔒● in the layers list is a tell of "cheap"). Icons are 16–20px,
`text-2`, accent on hover/active.

### 1.5 Motion primitives
- **Durations:** micro 120ms, standard 200ms, panel 260ms. **Easing:** standard ease-out for
  enters, ease-in-out for moves.
- **Standard transitions:** selection lift (element raises + glow), panel slide-in,
  popover fade+scale from origin, toast slide-up, value tween on numeric changes.
- **Never a frozen frame:** any wait shows a skeleton or inline spinner; the UI never looks
  broken while loading.

### 1.6 Component kit
A small documented kit so everything is consistent: Button (primary/secondary/ghost/icon),
Input/Stepper, Select, Slider, Swatch, SegmentedControl, Tabs, Popover, Tooltip, Toast,
Modal, Panel/Card, EmptyState, ListRow. Every screen is built from these — no one-off styles.

---

## 2. App shell & navigation

A persistent left **sidebar** (refined per §1): brand mark, then three destinations with a
line icon + label and a clear active state.

1. **My Store** — opens the live storefront in a new tab.
2. **Create Products** — the **Design Studio**: import from Printful and design any imported
   product. *No pricing here.*
3. **My Products** — the catalog: retail price, review, publish/unpublish, and the mockup
   selection that becomes the storefront gallery (§14).

Design vs. merchandising stay split (owner-approved): a design surface vs. a catalog surface,
matching how e-commerce tools work and giving publishing one clear home.

---

## 3. Create Products — import & open

Landing shows two blocks, both styled as premium cards (not a dev grid):

- **Import from Printful** — browse the catalog, one-click **Import & Design**. Search by
  name/brand/model. Import pulls all placements, variants, templates and printfiles.
- **Your products** — imported drafts and published, each a card with the product photo,
  name and a status pill. Click to open in the studio.

**Empty state** (no products yet): a warm, guided panel — "Import your first product to start
designing" with the import action front-and-center, not a blank page.

---

## 4. The Design Studio — layout

A three-zone editor, but the center dominates.

- **Top bar:** product name · **placement tabs** (§11) · **garment-color switch** (§12) ·
  autosave indicator · **undo / redo** · Save · Back.
- **Left rail:** the **Add & Assets** panels (§7) and the **Layers** list.
- **Center:** the **living canvas** (§5) — the hero.
- **Right:** contextual **Properties** for the selection (§8–§10) and the **Customer slots**
  panel (§12).

Panels are collapsible so the canvas can go near-full-width. The layout is calm: one accent
color, generous spacing, clear hierarchy.

---

## 5. The living canvas (elevated-flat)

The live preview is the flat design-on-template — the design composited into the print area
on the product image Printful returns — but **presented as a living object**. This is where
"flat ≠ dead" is won.

- **Big & centered.** The product photo is the stage, large, on a subtly graded surface with
  a soft contact shadow so it reads as a real object sitting in space (not a flat cutout on
  a black void).
- **Live garment color.** The garment-color switch recolors the product **in real time**;
  the design recomposites instantly. Switching colors is a core, delightful moment.
- **Zoom & pan.** Fit-to-screen, 100%, zoom to selection; Ctrl/Cmd-scroll or pinch to zoom;
  space-drag or trackpad to pan. A small zoom control shows the level.
- **The print area** is marked elegantly: the printable region is crisp and the
  out-of-bounds area is gently dimmed (not a harsh dashed rectangle). A quiet caption
  explains "anything outside the light area isn't printed."
- **Rulers & a soft grid** (P1) for precise placement, toggleable.
- **One engine, both apps.** The same renderer powers the storefront customizer (§15), so the
  shopper's preview equals the studio's.

Honest trade (unchanged, and now well-presented): for drinkware the live preview shows the
art on the flat print template, not wrapped around the object. The wrapped, photoreal look is
the Printful mockups in the gallery (§14). Every serious POD editor makes this trade.

---

## 6. Direct manipulation — the interaction model

This section is the antidote to "rigid." A top-tier editor lives or dies here.

### 6.1 Selection
- Click to select; **Shift-click** to add/remove from a multi-selection; click empty canvas
  to deselect; **marquee drag** on empty canvas to rubber-band select.
- The selection shows a clean bounding box with 8 transform handles and a rotate handle.

### 6.2 Transform
- **Move** by dragging the element (not just a tiny handle).
- **Scale** from any of 8 handles; **proportional by default** for images/graphics (hold to
  free-scale); text scales its box.
- **Rotate** from the rotate handle, **snapping to 15°** increments (hold Shift for free).
- Multi-selection transforms as a group.

### 6.3 Smart guides & snapping
As you drag, **alignment guides** appear (accent lines) when the element's centers/edges line
up with the canvas or with other elements, and it **snaps** with a light magnetic pull.
**Spacing badges** show equal gaps when distributing. This single feature is most of what
makes placement feel effortless instead of fiddly.

### 6.4 Contextual floating toolbar
A small toolbar floats just above the selection with the most-used actions in context:
duplicate, delete, lock, bring-forward/back, align, quick color, and **"Let the customer
change this"** (turns the element into a slot, §12). Everything you reach for is one click
away, on the canvas — not buried in a side panel.

### 6.5 Keyboard
Real shortcuts, discoverable via tooltips and a shortcuts sheet:
- Arrows nudge (Shift = 10×); **Delete/Backspace** remove.
- **Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z** undo/redo; **Cmd/Ctrl+D** duplicate; **Cmd/Ctrl+C/V**
  copy/paste; **Cmd/Ctrl+G** group / **Shift+Cmd/Ctrl+G** ungroup.
- **Cmd/Ctrl+]/[** layer order; **Esc** deselect; **Cmd/Ctrl+A** select all on placement.

### 6.6 Arrange
Align (6-way) and **distribute**; **group/ungroup**; **lock** and **hide**; reorder by
dragging rows in the Layers list (with drag affordance and drop indicator).

### 6.7 History (undo/redo)
A full undo/redo stack for every change — add, move, scale, recolor, edit text, slot changes,
delete. Visible undo/redo buttons in the top bar + keyboard. Destructive actions (delete)
also offer an **undo affordance in a toast**. Without this the tool feels dangerous and
cheap; **it ships in P0.**

---

## 7. Add & Assets — the creative panels

The left rail is a set of panels (a vertical icon rail switches between them), each designed
to feel like a well-stocked toolbox:

- **Text** — add a text element; the panel previews font styles (§9).
- **Uploads** — the owner's uploaded images (PNG/JPG/SVG), as a thumbnail grid with
  drag-to-canvas; upload via button or drag-drop onto the panel.
- **Shapes & graphics library** — the **provided searchable library** (§8), Iconify-backed
  plus the CC0 shapes pack.
- **My graphics** — the owner's reusable graphics library.
- **Backgrounds** — solid colors (brand palette), gradients, or a graphic across the
  placement.
- **Templates** — start-from-template designs (§13).
- **Quick designs** — the owner's saved element combos, re-applied in one click.

Interaction rules (all panels): **search**, **categories**, **recently used**, **favorites**,
and **drag from panel onto the canvas** (or click to place centered). Items have a name + tags;
search matches both.

---

## 8. Provided library (Iconify + CC0) — DECIDED

A searchable library of shapes/graphics, backed by the **Iconify API**
(`api.iconify.design`): 275k+ icons across 200+ open sets, a real search endpoint returning
clean SVGs on demand — near-zero storage on our side. Picking an icon imports it into the
owner's library so all the recolor / slot machinery just works.

**License safety (POD):** because the customer *prints and sells* the result, we **whitelist
only permissive / CC0-friendly sets** (MIT / ISC / Apache-2.0) and filter results to the
whitelist client-side as a guard. Attribution-required (CC-BY / share-alike) and brand/logo
sets are excluded.

**Whitelist** (licenses verified): `lucide` (ISC), `tabler` (MIT), `ph` Phosphor (MIT),
`heroicons` (MIT), `iconoir` (MIT), `material-symbols` (Apache-2.0), `fluent-emoji-flat`
(MIT, colored), `noto` (Apache-2.0, colored). Plus a hand-made **CC0 basic-shapes pack**
(rectangle, circle, triangle, star, heart, arrow). MIT/ISC/Apache need no printed
attribution; we keep a `NOTICE`/`LICENSES` file in the repo.

**Excluded (POD risk):** `simple-icons` and any brand/logo sets (trademarks); CC-BY /
share-alike sets (attribution awkward on a physical product). The owner can always upload
their own art.

---

## 9. Text as craft

Text is where amateur and premium editors diverge most. The current 6-font hardcoded list is
a tell. This section makes type a first-class craft.

### 9.1 Font system (P0/P1)
- A **curated font library** (Google Fonts subset chosen for POD legibility and range —
  display, script, serif, sans, mono), grouped by style, each shown as a **live preview
  rendered in its own face** (not a plain list).
- **Favorites** and **recently used**; **search** by name.
- **Curated pairings** (P1): tasteful heading+body combos applied in one click.

### 9.2 Controls
Family, size, weight, letter-spacing, line-height, alignment, case (UPPER/Title/lower), and
lines. All with sensible defaults so new text looks designed immediately.

### 9.3 Color
Text color from the **brand palette** (§10) + a full picker + **gradient fills** + an
**eyedropper** to sample any on-canvas color. Recent colors persist.

### 9.4 Effects (presets, then tweak)
One-click **presets** that then expose fine controls: **curve/arc**, **outline**
(color+width), **shadow**, **sticker** (thick white outline), and simple **lockups**
(stacked/curved arrangements). Presets get to a great look instantly; advanced users refine.

---

## 10. Image, graphic & color

### 10.1 Image / graphic
Replace, **fit / fill / crop**, flip, opacity, and — for SVG graphics — **recolor parts**
(each `data-recolor` part independently). Position/scale/rotate as any element. **Make
seamless pattern** (half-drop, block, brick, reflect, line) with scale/spacing/color.
Filters (P1); background removal (P2).

### 10.2 Color & brand system
The owner defines a **brand palette** once; it appears everywhere a color is chosen (text,
background, shape, and customer color-slots). Full picker, gradients, and eyedropper are
available alongside the palette. Consistent swatch component throughout.

---

## 11. Placements — keep, refined

A **top menu of the product's placements** (front / back / left sleeve / …). Clicking one
moves the canvas to that placement; you design that space only. Tabs show a **thumbnail +
element count**. Duplicate-an-element-to-another-placement stays. This is today's behavior,
which works — refined visually to match §1.

---

## 12. Variants & customer slots

### 12.1 Variant colors — owner curates offered colors
Printful variants are the source. The **owner chooses which colors to offer** and which to
hide; **all sizes are always offered.** Offered colors drive both the studio's garment-color
switch and the storefront's color picker. Curation UI uses real color swatches, not names.

### 12.2 Slot exposure — what the customer can and can't change (keep the model)
The owner authors the design, then marks each element **Fixed** or a **Customer slot**. This
mental model is good and stays — but it must *feel* effortless.

Slot types (named, required, with a default):
- **Text slot** — the customer types (label, max chars, lines).
- **Image slot** — the customer picks **one** image from a set the owner curates (+ default).
- **Color slot** — the customer picks one color from a set the owner curates (+ default).

"A design for 3 images" vs "for 1" is simply **how many image slots exist**. One slot offering
"pick 1 of 10" is the choose-one-of-many case. No new concept needed.

Make it effortless and obvious:
- **One gesture to create a slot:** the contextual toolbar's **"Let the customer change
  this"** turns the selected element into a slot inline — no hunting.
- **"What the customer fills" panel** — a **first-class, live** summary that renders the
  shopper's form exactly as they'll see it (e.g. *Front — Text "Name" (required) · Image
  "Pick 1 of 3" (required)*). Reorderable; each row links back to its element on the canvas;
  required badges shown. The owner sees precisely the form the customer gets.
- Every slot is **required by default** with a **default value**, so (a) the design always
  previews complete and (b) the shopper can't check out having skipped a slot — Add to cart
  stays disabled until each required slot is chosen/confirmed.
- Fixed elements read **"Fixed — the customer can't change this,"** front-and-center in
  properties.

---

## 13. Onboarding & momentum

This section is what turns "complicated to use and understand" into "I made something in a
minute."

- **Start from a template.** Opening a placement with no design offers **"Start from a
  template"** (a small set of tasteful, product-appropriate designs) or **"Start blank."**
  Templates are fully editable and seed good defaults. (Owner-curated set to grow over time.)
- **Guided empty states** everywhere (no product, no elements, no offered colors) — each a
  warm prompt with the next action, never a blank void.
- **Inline coach tips** — dismissible, contextual hints the first time you meet a feature
  (e.g. "Drag a corner to resize; hold Shift to free-scale"). Never nag.
- **First-run tour** (P1): a 4–5 step overlay on first entry to the studio.
- **Command palette** (P2): Cmd/Ctrl-K to jump to any action/tool by name.
- **Sample values** so every design previews complete out of the box.

---

## 14. Feedback, motion & saving

- **Autosave.** Changes save automatically with a subtle "Saved" / "Saving…" indicator; a
  manual Save remains for reassurance. No lost work.
- **Toasts** confirm actions and carry **undo** where relevant (e.g. after delete).
- **Skeletons & spinners** for every load — the studio never shows a frozen or empty frame
  while fetching.
- **Micro-interactions** per §1.5: hover lift, press feedback, panel transitions, value
  tweens, the selection lift+glow. Motion is quick and meaningful.

---

## 15. Pricing, mockups & publishing (My Products)

- **Pricing lives in My Products**, not the studio. Each product row has a retail price
  field, status, and design/edit links — presented as clean list rows per §1.
- **Publish** is in My Products. Publishing:
  1. **Auto-generates realistic mockups** (Printful) — up to **5** angles/styles, in a
     polished progress modal (no dead "rendering…" text; a real progress state). No manual
     "generate" button.
  2. The owner **selects which to feature, Instagram-style:** clicking mockups picks them in
     order — the **first is the main image (badge "1")**, the next are secondary ("2", "3",
     …), each with a numbered corner badge. Pick **1–5**, always exactly **one main**. The
     ordered selection becomes the storefront product gallery.
  3. Marks the product published; it appears in the storefront.
- **Unpublish** hides it (data retained).

---

## 16. Customer side — real-time preview, no mockup button

- The storefront customizer shows the **same living preview** as the studio (§5): instant
  composition and live garment color, so the shopper sees their name / chosen image on the
  real product **in real time**, always complete.
- **No customer "generate mockup" button.** Printful mockups are too slow to be a shopper
  action; the shopper relies on the real-time preview, and the polished photoreal images are
  the owner-curated mockups from publish (§15), shown in the product gallery.

---

## 17. Phasing — P0 / P1 / P2

**P0 — the premium bar (must ship together; anything missing still reads "cheap"):**
- Design language §1 (dark-premium skin, type/space/depth, icon set, component kit, motion).
- Living canvas §5 (large staged canvas, zoom/pan, **live garment color**, elegant print
  area, soft shadow).
- Direct manipulation §6 (multi-select, marquee, **smart guides + snapping**, contextual
  floating toolbar, keyboard, align/distribute, **undo/redo + history**).
- Text system §9.1–§9.3 (curated font library with live previews, core controls, brand
  palette + picker + eyedropper).
- Assets §7 with drag-to-canvas, search, recents, favorites; provided library §8.
- Customer slots §12 with the first-class "what the customer fills" panel and one-gesture
  slot creation; offered colors.
- Onboarding §13 start-from-template + guided empty states; feedback/motion §14 (autosave,
  toasts+undo, skeletons).
- Publishing §15 and customer parity §16.

**P1 — depth & polish:**
- Rulers/grid; font **pairings**; **gradient** fills; text effect **lockups**; image
  **filters**; curated **pairings**; first-run tour; recently-used everywhere; group as a
  named object; per-element opacity.

**P2 — product refinements (official next):** owner feedback from first real use.
1. **Blank by default.** Opening a placement starts on a truly empty canvas — no
   "Start designing" panel, no auto-inserted text box. (Removes the §13 template
   empty-state; keep only the guided *no-product* state.)
2. **Faster, resilient mockups.** Publishing must not hang or fail. Move mockup
   generation off the single held request to an **async job**: start the Printful task
   and return its id immediately; the client polls a lightweight status endpoint and
   shows real progress, tolerant of slow renders. (Optional future: a sub-second
   provider such as Dynamic Mockups via PSD templates.)
3. **Stable canvas.** Trackpad two-finger scroll must not let the artwork drift away —
   **clamp panning** so the product always stays in view; zoom stays free.
4. **Clean elements.** Remove the floating element label on the canvas (the orange tag);
   a text element shows only its own text. Layer names live in the Layers panel.
5. **Remove Templates & Quick designs.** Drop the templates panel, font pairings and
   quick-designs entirely — not useful in practice.
6. **Library previews.** The shapes & icons library shows a sample set of icons before
   any search, so the owner sees what kind of content is available.

**P-00 — optional, someday (deferred, not yet):**
- **Background removal**; **command palette**; brand-kit management (multiple palettes/logos);
  design versioning/history browser; collaborative niceties; AI assists (auto-layout,
  suggest fonts/colors).

---

## 18. What this changes vs. the current build

| Area | Today (built) | Target (this doc) |
|---|---|---|
| Visual language | dark "dev tool" (10px mono, tiny swatches) | dark **premium** design system (§1) |
| Canvas | small flat composite on black | **living canvas**: large, zoom/pan, live garment color, shadow (§5) |
| Manipulation | tiny ↑↓ buttons, one resize handle | **multi-select, smart guides, floating toolbar, keyboard, undo/redo** (§6) |
| Undo/redo | **none** | full history, visible + keyboard, undo toasts (§6.7) |
| Text | 6 hardcoded fonts | curated font library w/ previews, pairings, effects, gradients (§9) |
| Color | 8 fixed swatches | brand palette + picker + gradient + eyedropper (§10.2) |
| Library | Iconify grid (cramped, inverted thumbs) | searchable panels: drag-to-canvas, categories, recents, favorites (§7–§8) |
| Slots | per-element toggles | one-gesture slot + first-class "what the customer fills" panel (§12) |
| Onboarding | none (blank canvas) | start-from-template, guided empty states, coach tips (§13) |
| Feedback | manual save, static | autosave, toasts+undo, skeletons, micro-interactions (§14) |
| Publishing | in studio (removed) | in My Products, mockups on publish, Instagram pick (§15) |

---

## 19. Reconciliation with other docs (to do)

- `03-ui-ux.md §6` (admin screens) → replace §6.4 Composer detail with a pointer here; add the
  sidebar nav, the design-language reference, and the My Products screen.
- `04-flows.md` → admin flow: import → design (Create Products) → price/publish (My Products)
  → mockups on publish.
- `06-implementation-plan.md` → re-scope M4 around this doc's **phases**: P0 (premium bar), P1
  (depth), P2 (power). Add the design-language, undo/redo, smart-guides, font-system and
  templates work items explicitly.
- `05-backend-schema.md` → already added: `products.offered_variant_colors`, product
  `mockups` (generated + featured), the provided-library concept, and image `choiceSlot`.
  Add (as needed by phase): a `brand_palette` / brand-kit concept and `templates`.

---

## 20. Resolved decisions log
- Nav split: My Store / Create Products (design) / My Products (price + publish). ✓
- Visual direction: **dark premium** (Linear/Framer grade). ✓ (new)
- Live preview: **elevated-flat** — one universal living canvas; no client-side 3D. ✓
- Direct manipulation: undo/redo + smart guides + floating toolbar are **P0 non-negotiable**. ✓ (new)
- Provided library: Iconify API, whitelisted to safe licenses + CC0 pack. ✓
- Slot model: named required slots (text / pick-image / pick-color); slot count = number of
  image slots; a first-class "what the customer fills" panel. ✓
- Variant colors: owner curates offered colors; all sizes always offered. ✓
- Mockups: auto-generated on publish (≤5), Instagram-style ordered pick, one main. ✓
- Customer side: real-time living preview; no "generate mockup" button. ✓
- Onboarding: start-from-template + guided empty states. ✓ (new)
