import braces from "./seed/braces.svg?raw";
import code from "./seed/code.svg?raw";
import hexagono from "./seed/hexagono.svg?raw";
import rama from "./seed/rama.svg?raw";
import serpiente from "./seed/serpiente.svg?raw";
import taza from "./seed/taza.svg?raw";
import terminalWindow from "./seed/terminal-window.svg?raw";
import terminal from "./seed/terminal.svg?raw";

import type { AssetLibrary } from "./compose";

export interface SeedAsset {
  slug: string;
  name: string;
  category: "icono" | "forma";
  svg: string;
  /** Partes recoloreables declaradas en el SVG (data-recolor). */
  recolorParts: string[];
  /** ancho/alto del viewBox. El admin coloca los assets con su proporcion real. */
  aspect: number;
}

/**
 * Libreria semilla mientras el admin y R2 no existan.
 *
 * Los assets son la unica pieza que se autora a mano en SVG, y por eso son pocos
 * y reutilizables: los disenos se componen con ellos desde el admin, sin tocar XML.
 */
const RAW: Array<[string, string, SeedAsset["category"], string]> = [
  ["code", "Code", "icono", code],
  ["braces", "Braces", "icono", braces],
  ["terminal", "Terminal", "icono", terminal],
  ["serpiente", "Serpiente", "icono", serpiente],
  ["taza", "Taza", "icono", taza],
  ["rama", "Rama", "icono", rama],
  ["hexagono", "Hexagono", "icono", hexagono],
  ["terminal-window", "Ventana de terminal", "forma", terminalWindow],
];

function parts(svg: string): string[] {
  return [...new Set([...svg.matchAll(/data-recolor="([^"]+)"/g)].map((m) => m[1]))];
}

function aspect(svg: string): number {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return 1;
  const [, , w, h] = m[1].trim().split(/[\s,]+/).map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

export const SEED_ASSETS: SeedAsset[] = RAW.map(([slug, name, category, svg]) => ({
  slug, name, category, svg, recolorParts: parts(svg), aspect: aspect(svg),
}));

export function seedLibrary(): AssetLibrary & { list(): SeedAsset[] } {
  const map = new Map(SEED_ASSETS.map((a) => [a.slug, a.svg]));
  return { getSvg: (slug) => map.get(slug), list: () => SEED_ASSETS };
}

/** Thumbnail del asset para la UI, sin pasar por la red. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
