import { useSyncExternalStore } from "react";
import type { SlotValues } from "@abbiss/preview-engine";

export interface CartLine {
  key: string;
  productId: string;
  productSlug: string;
  designId: string;
  name: string;
  variantId: string;
  variantLabel: string;
  slotValues: SlotValues;
  unitPriceCents: number;
  qty: number;
  previewUrl?: string;
}

const KEY = "abbiss_cart";
let lines: CartLine[] = load();
const subs = new Set<() => void>();

function load(): CartLine[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function persist() {
  localStorage.setItem(KEY, JSON.stringify(lines));
  subs.forEach((f) => f());
}

export const cart = {
  add(line: Omit<CartLine, "key">) {
    lines = [...lines, { ...line, key: crypto.randomUUID().slice(0, 8) }];
    persist();
  },
  setQty(key: string, qty: number) {
    lines = lines.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l));
    persist();
  },
  remove(key: string) { lines = lines.filter((l) => l.key !== key); persist(); },
  clear() { lines = []; persist(); },
  get() { return lines; },
  subtotalCents() { return lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0); },
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => subs.delete(cb); },
    () => lines,
  );
}
