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
  category: "icon" | "shape";
  svg: string;
  /** Recolorable parts declared in the SVG (data-recolor). */
  recolorParts: string[];
  /** viewBox width/height. The admin places assets at their real aspect. */
  aspect: number;
}

/**
 * Seed library until the admin and R2 exist.
 *
 * Assets are the only piece authored by hand in SVG, which is why they are few and
 * reusable: designs are composed from them in the admin, without touching XML.
 */
const RAW: Array<[string, string, SeedAsset["category"], string]> = [
  ["code", "Code", "icon", code],
  ["braces", "Braces", "icon", braces],
  ["terminal", "Terminal", "icon", terminal],
  ["serpiente", "Snake", "icon", serpiente],
  ["taza", "Mug", "icon", taza],
  ["rama", "Branch", "icon", rama],
  ["hexagono", "Hexagon", "icon", hexagono],
  ["terminal-window", "Terminal window", "shape", terminalWindow],
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

/** Asset thumbnail for the UI, without going over the network. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
