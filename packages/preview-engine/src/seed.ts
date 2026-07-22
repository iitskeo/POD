import braces from "./seed/braces.svg?raw";
import code from "./seed/code.svg?raw";
import hexagono from "./seed/hexagono.svg?raw";
import rama from "./seed/rama.svg?raw";
import serpiente from "./seed/serpiente.svg?raw";
import taza from "./seed/taza.svg?raw";
import terminalWindow from "./seed/terminal-window.svg?raw";
import terminal from "./seed/terminal.svg?raw";

/** Bundled starter graphics. The owner's real library lives in the assets API;
 *  these ship so a fresh design has something to place. Ids are prefixed 'seed:'. */
export interface SeedAsset {
  id: string;
  name: string;
  svg: string;
  recolorParts: string[];
  aspect: number;
}

const RAW: Array<[string, string, string]> = [
  ["code", "Code", code],
  ["braces", "Braces", braces],
  ["terminal", "Terminal", terminal],
  ["serpiente", "Snake", serpiente],
  ["taza", "Mug", taza],
  ["rama", "Branch", rama],
  ["hexagono", "Hexagon", hexagono],
  ["terminal-window", "Terminal window", terminalWindow],
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

export const SEED_ASSETS: SeedAsset[] = RAW.map(([slug, name, svg]) => ({
  id: `seed:${slug}`, name, svg, recolorParts: parts(svg), aspect: aspect(svg),
}));

export const SEED_SVG = new Map(SEED_ASSETS.map((a) => [a.id, a.svg]));

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
