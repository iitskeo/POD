import type { PrintSpec } from "./types";

/** Rectangle in print file coordinates (spec px). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lets the customer pick which asset fills this slot, from a curated set. */
export interface ChoiceSlot {
  label: string;
  /** Library slugs. */
  options: string[];
}

/**
 * Recolors a part of the asset's SVG (those marked with data-recolor).
 * Fixed options defined by the admin, never a free picker: this is what makes the
 * one-accent-per-composition rule unbreakable.
 */
export interface RecolorSlot {
  /** data-recolor value inside the asset's SVG. */
  part: string;
  label: string;
  options: string[];
  default: string;
}

export interface AssetElement {
  id: string;
  kind: "asset";
  rect: Rect;
  /** Default asset, and the only one when there is no choice. */
  slug: string;
  /** When absent, the asset is fixed and the customer cannot change it. */
  choice?: ChoiceSlot;
  recolor: RecolorSlot[];
}

export interface TextElement {
  id: string;
  kind: "text";
  rect: Rect;
  label: string;
  maxChars: number;
  /** Minimum legible size as a fraction of the file height. */
  minSizeFrac: number;
  maxLines: number;
  color: string;
  fontFamily: string;
  placeholder: string;
  /** When set, the text is fixed and the customer cannot edit it. */
  fixed?: string;
}

/** Reserved. Needs background removal; out of scope for stage 1. */
export interface PhotoElement {
  id: string;
  kind: "photo";
  rect: Rect;
  label: string;
}

export type DesignElement = AssetElement | TextElement | PhotoElement;

/** Human label for an element, whatever its kind. */
export function elementLabel(el: DesignElement): string {
  return el.kind === "asset" ? el.slug : el.label;
}

export interface Design {
  id: string;
  name: string;
  spec: PrintSpec;
  /** Legible visible angle. Defines the usable width of the file. */
  safeAngleDeg: number;
  /** Fixed background art. Always printed as-is; never customizable. */
  baseImage?: string;
  /** Drawn in order. The first one sits at the back. */
  elements: DesignElement[];
}

/**
 * Values chosen by the customer.
 * Keys: `<elementId>` for choice and text, `<elementId>.<part>` for recolor.
 */
export type SlotValues = Record<string, string>;

export function defaultValues(design: Design): SlotValues {
  const v: SlotValues = {};
  for (const el of design.elements) {
    if (el.kind === "asset") {
      if (el.choice) v[el.id] = el.slug;
      for (const r of el.recolor) v[`${el.id}.${r.part}`] = r.default;
    } else if (el.kind === "text" && !el.fixed) {
      v[el.id] = "";
    }
  }
  return v;
}

/**
 * Fraction of the file width that is visible from the front.
 *
 * The file covers `wrapDegrees` of the product; of those, only the middle
 * `2*safeAngleDeg` are legible. If the file wraps less than the legible zone, all of
 * it shows.
 */
export function safeWidthFrac(safeAngleDeg: number, wrapDegrees: number | null): number {
  if (!wrapDegrees) return 1; // flat surface: no curvature to clip it
  return Math.min(1, (2 * safeAngleDeg) / wrapDegrees);
}

/** Safe zone rectangle, in file coordinates. */
export function safeRect(design: Design): Rect {
  const w = design.spec.widthPx * safeWidthFrac(design.safeAngleDeg, design.spec.wrapDegrees);
  return { x: (design.spec.widthPx - w) / 2, y: 0, w, h: design.spec.heightPx };
}
