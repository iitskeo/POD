import type { Element, GraphicElement, ImageElement, SlotValues, TextElement } from "./types";

/** The customer-facing slot exposed by an element, if any (spec section 8). */
export type Slot =
  | { kind: "text"; elementId: string; label: string; maxChars: number; default: string }
  | { kind: "color"; elementId: string; label: string; options: string[]; default: string }
  | { kind: "graphic"; elementId: string; label: string; options: string[]; default: string }
  | { kind: "image"; elementId: string; label: string; options: string[]; default: string };

/** Enumerate the slots a design exposes, in draw order. */
export function slotsOf(elements: Element[]): Slot[] {
  const out: Slot[] = [];
  for (const el of [...elements].sort((a, b) => a.z - b.z)) {
    if (el.kind === "text" && el.editable) {
      out.push({ kind: "text", elementId: el.id, label: el.textLabel ?? "Text", maxChars: el.maxChars, default: el.content });
    }
    if (el.kind === "text" && el.colorSlot) {
      out.push({ kind: "color", elementId: el.id, label: el.colorSlot.label, options: el.colorSlot.options, default: el.colorSlot.default });
    }
    if (el.kind === "graphic" && el.choiceSlot) {
      out.push({ kind: "graphic", elementId: el.id, label: el.choiceSlot.label, options: el.choiceSlot.options, default: el.assetId });
    }
    if (el.kind === "graphic" && el.colorSlot) {
      out.push({ kind: "color", elementId: el.id, label: el.colorSlot.label, options: el.colorSlot.options, default: el.colorSlot.default });
    }
    if (el.kind === "image" && el.choiceSlot) {
      out.push({ kind: "image", elementId: el.id, label: el.choiceSlot.label, options: el.choiceSlot.options, default: el.storageKey });
    }
  }
  return out;
}

/** Default slot values so a design always previews complete. */
export function defaultValues(elements: Element[]): SlotValues {
  const v: SlotValues = {};
  for (const s of slotsOf(elements)) {
    const key = s.kind === "graphic" ? `${s.elementId}.graphic`
      : s.kind === "image" ? `${s.elementId}.image`
      : s.kind === "color" ? `${s.elementId}.color` : s.elementId;
    v[key] = s.default;
  }
  return v;
}

/** Resolved text: the content and color the customer's choices produce. */
export function resolveText(el: TextElement, values: SlotValues): { content: string; color: string } {
  const content = el.editable ? (values[el.id] ?? el.content) : el.content;
  const color = el.colorSlot ? (values[`${el.id}.color`] ?? el.colorSlot.default) : el.color;
  return { content, color };
}

/** Resolved graphic: which asset and part-color the customer's choices produce. */
export function resolveGraphic(el: GraphicElement, values: SlotValues): { assetId: string; color?: string } {
  const assetId = el.choiceSlot
    ? (el.choiceSlot.options.includes(values[`${el.id}.graphic`] ?? "") ? values[`${el.id}.graphic`] : el.assetId)
    : el.assetId;
  const color = el.colorSlot ? (values[`${el.id}.color`] ?? el.colorSlot.default) : undefined;
  return { assetId, color };
}

/** Resolved image: which uploaded image the customer's choice produces. */
export function resolveImage(el: ImageElement, values: SlotValues): string {
  if (!el.choiceSlot) return el.storageKey;
  const chosen = values[`${el.id}.image`];
  return chosen && el.choiceSlot.options.includes(chosen) ? chosen : el.storageKey;
}

/** Longest text within a slot's char limit — used for add-to-cart gating. */
export function textOverflow(el: TextElement, values: SlotValues): boolean {
  if (!el.editable) return false;
  return (values[el.id] ?? "").length > el.maxChars;
}
