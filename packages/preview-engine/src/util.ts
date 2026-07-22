import type { Element, Rect } from "./types";

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Align a rect within the print-file bounds (W×H), in print-file coordinates. */
export function alignRect(r: Rect, align: Align, W: number, H: number): Rect {
  switch (align) {
    case "left": return { ...r, x: 0 };
    case "hcenter": return { ...r, x: Math.round((W - r.w) / 2) };
    case "right": return { ...r, x: W - r.w };
    case "top": return { ...r, y: 0 };
    case "vcenter": return { ...r, y: Math.round((H - r.h) / 2) };
    case "bottom": return { ...r, y: H - r.h };
  }
}

/** Snap a moving rect to the print-file center lines within a pixel tolerance. */
export function snapRect(r: Rect, W: number, H: number, tol: number): Rect {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const out = { ...r };
  if (Math.abs(cx - W / 2) < tol) out.x = Math.round((W - r.w) / 2);
  if (Math.abs(cy - H / 2) < tol) out.y = Math.round((H - r.h) / 2);
  return out;
}

/** A short human label for an element, used in the stage tag and layers list. */
export function elementLabel(el: Element): string {
  switch (el.kind) {
    case "text": return el.editable ? (el.textLabel ?? "Text") : `"${el.content.slice(0, 12)}"`;
    case "graphic": return "Graphic";
    case "image": return "Image";
    case "pattern": return "Pattern";
    case "background": return "Background";
  }
}
