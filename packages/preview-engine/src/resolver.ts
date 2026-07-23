import type { ApiClient } from "./api";
import { recolorSvg, type Resolver } from "./compose";
import { SEED_SVG } from "./seed";
import { SHAPE_SVG } from "./shapes";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load failed: ${src}`));
    img.src = src;
  });
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return loadImage(url).finally(() => URL.revokeObjectURL(url));
}

/**
 * Default Resolver: turns asset ids and upload keys into drawable images, recoloring
 * SVGs and caching results. Seed graphics are bundled ('seed:*'); the rest come from
 * the assets/uploads API. One instance per editor session so the cache is warm.
 */
export function makeResolver(api: ApiClient): Resolver {
  const cache = new Map<string, Promise<CanvasImageSource | null>>();

  const graphic = (assetId: string, color?: string): Promise<CanvasImageSource | null> => {
    const key = `g:${assetId}:${color ?? ""}`;
    let hit = cache.get(key);
    if (hit) return hit;
    hit = (async () => {
      const bundled = SEED_SVG.get(assetId) ?? SHAPE_SVG.get(assetId);
      if (bundled) {
        // Bundled graphics use a single named recolor part; recolor the first one.
        const part = [...bundled.matchAll(/data-recolor="([^"]+)"/g)][0]?.[1];
        return svgToImage(color && part ? recolorSvg(bundled, part, color) : bundled);
      }
      // API asset: fetch bytes; recolor if it is an SVG and a color is requested.
      const url = api.assetFileUrl(assetId);
      if (color) {
        const svg = await fetch(url).then((r) => r.text()).catch(() => "");
        if (svg.includes("<svg")) {
          const part = [...svg.matchAll(/data-recolor="([^"]+)"/g)][0]?.[1];
          return svgToImage(part ? recolorSvg(svg, part, color) : svg);
        }
      }
      return loadImage(url).catch(() => null);
    })();
    cache.set(key, hit);
    return hit;
  };

  const image = (storageKey: string): Promise<CanvasImageSource | null> => {
    const key = `i:${storageKey}`;
    let hit = cache.get(key);
    if (hit) return hit;
    // storageKey is an upload id (served at /api/uploads/{id}); accept full URLs too.
    const url = storageKey.startsWith("http") ? storageKey : api.uploadUrl(storageKey);
    hit = loadImage(url).catch(() => null);
    cache.set(key, hit);
    return hit;
  };

  return { graphic, image };
}
