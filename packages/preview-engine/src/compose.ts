import type { Design, SlotValues, TextElement } from "./design";
import { safeRect } from "./design";

export interface AssetLibrary {
  /** slug -> fuente SVG del asset. Fuente, no imagen: hay que recolorear antes. */
  getSvg(slug: string): string | undefined;
}

function rasterize(svg: string, w: number, h: number): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG invalido")); };
    img.width = w;
    img.height = h;
    img.src = url;
  });
}

/** Aplica los colores a las partes marcadas con data-recolor. */
function recolor(svg: string, colors: Record<string, string>): string {
  if (Object.keys(colors).length === 0) return svg;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  for (const [part, color] of Object.entries(colors)) {
    doc.querySelectorAll(`[data-recolor="${part}"]`).forEach((el) => {
      const mode = el.getAttribute("data-recolor-paint") ?? "fill";
      el.setAttribute(mode, color);
    });
  }
  return new XMLSerializer().serializeToString(doc);
}

interface FittedText {
  lines: string[];
  size: number;
  overflow: boolean;
}

/**
 * Ajusta el texto con tamano minimo. Encoger sin limite deja los nombres largos
 * ilegibles (lo mostro el spike); al tocar el minimo se parte en lineas.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { w: number; h: number },
  el: Pick<TextElement, "minSizeFrac" | "maxLines" | "fontFamily">,
  fileHeight: number,
): FittedText {
  const minSize = el.minSizeFrac * fileHeight;
  const measure = (lines: string[], size: number) => {
    ctx.font = `700 ${size}px ${el.fontFamily}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };
  for (let count = 1; count <= el.maxLines; count++) {
    const lines = splitLines(text, count);
    if (lines.length !== count) continue;
    for (let size = box.h / count; size >= minSize; size -= 1) {
      if (measure(lines, size) <= box.w) return { lines, size, overflow: false };
    }
  }
  return { lines: splitLines(text, el.maxLines), size: minSize, overflow: true };
}

function splitLines(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count === 1 || words.length < count) return [text.trim()];
  const lines: string[] = [];
  const per = Math.ceil(words.length / count);
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
  return lines;
}

/**
 * Dibuja el archivo de impresion plano.
 *
 * Misma llamada para el preview (escala baja) y para la imprenta (escala 1 = 300
 * DPI). Que sea el mismo codigo es lo que garantiza que lo impreso coincide con lo
 * que el cliente aprobo.
 */
export class DesignComposer {
  private cache = new Map<string, HTMLImageElement>();
  private assets: AssetLibrary;

  constructor(assets: AssetLibrary) {
    this.assets = assets;
  }

  /**
   * Rasteriza un asset ya recoloreado, con cache.
   *
   * Recolorear obliga a re-rasterizar, que es caro; escribir texto no. Sin cache,
   * cada tecla rasterizaria todos los assets del diseno.
   */
  private async raster(slug: string, colors: Record<string, string>, w: number, h: number) {
    const key = `${slug}|${w}x${h}|${JSON.stringify(colors)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const svg = this.assets.getSvg(slug);
    if (!svg) return null;
    const img = await rasterize(recolor(svg, colors), w, h);
    this.cache.set(key, img);
    return img;
  }

  async draw(
    canvas: HTMLCanvasElement,
    design: Design,
    values: SlotValues,
    scale = 1,
  ): Promise<{ overflow: boolean }> {
    const w = Math.round(design.spec.widthPx * scale);
    const h = Math.round(design.spec.heightPx * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);

    const safe = safeRect(design);
    let overflow = false;

    for (const el of design.elements) {
      const box = {
        x: el.rect.x * scale, y: el.rect.y * scale,
        w: el.rect.w * scale, h: el.rect.h * scale,
      };

      if (el.kind === "asset") {
        const slug = el.choice ? (values[el.id] ?? el.slug) : el.slug;
        const colors: Record<string, string> = {};
        for (const r of el.recolor) colors[r.part] = values[`${el.id}.${r.part}`] ?? r.default;
        const img = await this.raster(slug, colors, Math.round(box.w), Math.round(box.h));
        if (img) ctx.drawImage(img, box.x, box.y, box.w, box.h);
      } else if (el.kind === "text") {
        const text = (el.fixed ?? values[el.id] ?? "").trim();
        if (!text) continue;
        // El texto no puede salirse de la zona segura aunque su caja sea mas ancha.
        const left = Math.max(box.x, safe.x * scale);
        const right = Math.min(box.x + box.w, (safe.x + safe.w) * scale);
        const maxW = Math.max(right - left, 1);
        const fit = fitText(ctx, text, { w: maxW, h: box.h }, el, h);
        overflow = overflow || fit.overflow;
        ctx.fillStyle = el.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${fit.size}px ${el.fontFamily}`;
        const lineH = fit.size * 1.1;
        const cy = box.y + box.h / 2 - ((fit.lines.length - 1) * lineH) / 2;
        fit.lines.forEach((l, i) => ctx.fillText(l, box.x + box.w / 2, cy + i * lineH));
      }
    }

    return { overflow };
  }
}
