import { renderArtwork, type Resolver } from "./compose";
import type { Element, Placement, SlotValues } from "./types";

/**
 * Client-side garment recolouring (docs/pod/09 §2.1). Printful's design template is a neutral
 * garment on a white background, identical for every colour, so we tint it ourselves: mask the
 * white background out, then multiply the garment by the variant's colour, preserving its own
 * folds/shading. Real-time, cached, preview-only (the print file is never touched). The CDN
 * sends `Access-Control-Allow-Origin: *`, so we can read pixels without tainting the canvas.
 */

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NEAR_WHITE = 240; // a garment-on-white template's background reads ~255; folds dip below.

function cornersNearWhite(px: Uint8ClampedArray, w: number, h: number): boolean {
  const at = (x: number, y: number) => { const o = (y * w + x) * 4; return Math.min(px[o], px[o + 1], px[o + 2]); };
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  return corners.filter((v) => v >= NEAR_WHITE).length >= 3;
}

/** Flood-fill the near-white background inward from every edge. Robust even when the garment
 *  itself is near-white: the interior isn't reached unless it connects to the border. */
function floodBackground(px: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (bg[i]) return;
    const o = i * 4;
    if (Math.min(px[o], px[o + 1], px[o + 2]) >= NEAR_WHITE) { bg[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { consider(x, 0); consider(x, h - 1); }
  for (let y = 0; y < h; y++) { consider(0, y); consider(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    consider(x + 1, y); consider(x - 1, y); consider(x, y + 1); consider(x, y - 1);
  }
  return bg;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * A recoloured garment as a data URL, or null when the template isn't a garment-on-white photo
 * (e.g. all-over/knit schematics) so callers fall back to the original. Cached per (url,colour).
 */
export function recolorGarment(url: string | undefined, colorCode: string | null | undefined): Promise<string | null> {
  if (!url || !colorCode) return Promise.resolve(null);
  const key = `${url}|${colorCode}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const task = (async (): Promise<string | null> => {
    const img = await loadImg(url);
    if (!img || !img.naturalWidth) return null;
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    let data: ImageData;
    try { data = ctx.getImageData(0, 0, w, h); } catch { return null; }
    const px = data.data;
    if (!cornersNearWhite(px, w, h)) return null; // not a garment-on-white template — skip.
    const bg = floodBackground(px, w, h);
    const [tr, tg, tb] = hexToRgb(colorCode);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (bg[i]) { px[o + 3] = 0; continue; } // background → transparent (stage shows through)
      const lum = (0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2]) / 255;
      px[o] = tr * lum; px[o + 1] = tg * lum; px[o + 2] = tb * lum;
    }
    ctx.putImageData(data, 0, 0);
    try { return c.toDataURL("image/png"); } catch { return null; }
  })().catch(() => null);
  cache.set(key, task);
  return task;
}

/**
 * A flat product thumbnail = the (optionally recoloured) garment with the design composited in
 * the print area. Used for catalog cards when a product has no Printful mockup yet (docs/pod/09
 * §2.2). Returns a data URL, or null on failure.
 */
export async function composeProductThumbnail(opts: {
  placement: Placement; elements: Element[]; values: SlotValues; resolver: Resolver;
  garmentColor?: string | null; size?: number;
}): Promise<string | null> {
  const { placement, elements, values, resolver, garmentColor, size = 480 } = opts;
  const recolored = garmentColor ? await recolorGarment(placement.imageUrl, garmentColor) : null;
  const gimg = await loadImg(recolored ?? placement.imageUrl);
  if (!gimg) return null;
  const aspect = placement.templateWidth / placement.templateHeight || 1;
  const W = size, H = Math.max(1, Math.round(size / aspect));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (placement.backgroundColor && !recolored) { ctx.fillStyle = placement.backgroundColor; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(gimg, 0, 0, W, H);
  const aw = (placement.printArea.width / placement.templateWidth) * W;
  const scale = Math.max(0.02, aw / placement.printSpec.widthPx);
  const art = document.createElement("canvas");
  await renderArtwork(art, placement, elements, values, resolver, scale);
  const ax = (placement.printArea.left / placement.templateWidth) * W;
  const ay = (placement.printArea.top / placement.templateHeight) * H;
  const ah = (placement.printArea.height / placement.templateHeight) * H;
  ctx.drawImage(art, ax, ay, aw, ah);
  try { return c.toDataURL("image/png"); } catch { return null; }
}
