import type { Element } from "./types";

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
