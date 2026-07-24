// Spec types — docs/pod/05-backend-schema.md section 3. One engine, both apps.

export interface Rect { x: number; y: number; w: number; h: number }

// ---- Product side (3.1, 3.2) ---------------------------------------------------

export interface Placement {
  placement: string;              // 'front' | 'back' | 'sleeve_left' | ...
  imageUrl: string;               // flat template image for this panel
  backgroundColor: string | null;
  templateWidth: number;          // px of the template image
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number }; // template px
  printSpec: { widthPx: number; heightPx: number; dpi: number };            // print file size
  technique: string;
}

export interface Variant {
  id: number;
  size: string | null;
  color: string | null;
  colorCode: string | null;
  image: string;
}

// ---- Elements (3.3) ------------------------------------------------------------

export interface ElementBase {
  id: string;
  placement: string;
  rect: Rect;                     // in the placement's print-file coordinates
  z: number;
  rotation?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface TextElement extends ElementBase {
  kind: "text";
  content: string;
  font: string;
  color: string;
  align: "left" | "center" | "right";
  maxLines: number;
  minSizeFrac: number;
  maxChars: number;
  weight?: number;                 // font weight (default 700)
  case?: "upper" | "title" | "lower"; // letter-case transform at render time
  lineHeight?: number;             // line-height multiplier (default 1.15)
  letterSpacing?: number;
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; dx: number; dy: number };
  arc?: number;
  editable: boolean;
  textLabel?: string;
  colorSlot?: { label: string; options: string[]; default: string };
}

export interface GraphicElement extends ElementBase {
  kind: "graphic";
  assetId: string;
  choiceSlot?: { label: string; options: string[] };
  colorSlot?: { label: string; part: string; options: string[]; default: string };
}

export interface ImageElement extends ElementBase {
  kind: "image";
  storageKey: string;              // default upload id
  aspect: number;
  // Image-choice slot: the customer picks among uploaded images (upload ids),
  // without the owner routing them through the graphics library.
  choiceSlot?: { label: string; options: string[] };
}

export interface PatternElement extends ElementBase {
  kind: "pattern";
  source: { assetId?: string; storageKey?: string };
  type: "half_drop" | "block" | "brick" | "reflect" | "line_h" | "line_v";
  scale: number;
  spacing: number;
  color?: string;
}

export interface BackgroundElement extends ElementBase {
  kind: "background";
  fill: { color?: string; assetId?: string; storageKey?: string };
}

export type Element =
  | TextElement | GraphicElement | ImageElement | PatternElement | BackgroundElement;

// ---- Slot values (3.4) ---------------------------------------------------------
// '<id>' -> text, '<id>.graphic' -> asset id, '<id>.color' -> hex
export type SlotValues = Record<string, string>;

// ---- Client-facing aggregates --------------------------------------------------

export interface Product {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published";
  source: string;
  externalProductId: string;
  externalVariantId: string | null;
  hasPhoto: boolean;
  retailPriceCents: number;
  currency: string;
  placements: Placement[];
  variantTemplates: Record<number, Placement[]> | null;
  variants: Variant[];
  techniques: string[];
  /** Owner-curated variant colors offered to the shopper. null = offer all. */
  offeredVariantColors: string[] | null;
  /** Printful mockups from publish. featured is ordered; the first is the main image. */
  mockups: { generated: string[]; featured: string[] } | null;
}

export interface Design {
  id: string;
  productId: string;
  name: string;
  status: "draft" | "published";
  elements: Element[];
}

/** An owner graphic in the library. */
export interface Asset {
  id: string;
  name: string;
  collection: string | null;
  kind: "svg" | "png";
  aspect: number;
  recolorParts: string[];
}
