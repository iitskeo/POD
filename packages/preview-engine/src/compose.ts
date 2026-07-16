import type { Design, SlotValues, TextSlot } from "./design";
import { safeWidthFrac } from "./design";

/** Rectangulo del placeholder, en coordenadas del viewBox del SVG. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AssetLibrary {
  /** slug -> imagen ya cargada del asset. */
  get(slug: string): CanvasImageSource | undefined;
}

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, "image/svg+xml");
}

function viewBox(doc: Document): { w: number; h: number } {
  const vb = doc.documentElement.getAttribute("viewBox");
  if (!vb) throw new Error("El SVG del diseno necesita viewBox");
  const [, , w, h] = vb.trim().split(/[\s,]+/).map(Number);
  return { w, h };
}

function placeholderRect(doc: Document, target: string): Rect | null {
  const el = doc.querySelector(`[data-slot="${target}"]`);
  if (!el) return null;
  const num = (a: string) => Number(el.getAttribute(a) ?? NaN);
  const x = num("x"), y = num("y"), w = num("width"), h = num("height");
  if ([x, y, w, h].some(Number.isNaN)) return null;
  return { x, y, w, h };
}

/**
 * Aplica los slots de color y quita los placeholders, devolviendo el SVG listo
 * para rasterizar. Los placeholders de choice/text solo aportan geometria: si se
 * rasterizaran, saldrian impresos.
 */
function bakeSvg(design: Design, values: SlotValues): string {
  const doc = parse(design.svg);
  for (const slot of design.slots) {
    if (slot.type === "color") {
      const color = values[slot.id] ?? slot.default;
      doc.querySelectorAll(`[data-slot="${slot.target}"]`).forEach((el) => {
        const mode = el.getAttribute("data-slot-paint") ?? "fill";
        el.setAttribute(mode, color);
      });
    } else if (slot.type === "choice" || slot.type === "text" || slot.type === "photo") {
      doc.querySelector(`[data-slot="${slot.target}"]`)?.remove();
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

function rasterize(svg: string, w: number, h: number): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.width = w;
    img.height = h;
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo rasterizar el SVG del diseno"));
    };
    img.src = url;
  });
}

interface FittedText {
  lines: string[];
  size: number;
  overflow: boolean;
}

/**
 * Ajusta el texto con tamano minimo. Encoger sin limite deja los nombres largos
 * ilegibles (lo mostro el spike). Al tocar el minimo se parte en lineas.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { w: number; h: number },
  slot: TextSlot,
  fileHeight: number,
): FittedText {
  const minSize = slot.minSizeFrac * fileHeight;
  const measure = (lines: string[], size: number) => {
    ctx.font = `700 ${size}px ${slot.fontFamily}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };

  for (let count = 1; count <= slot.maxLines; count++) {
    const lines = splitLines(text, count);
    if (lines.length !== count) continue;
    for (let size = box.h / count; size >= minSize; size -= 1) {
      if (measure(lines, size) <= box.w) return { lines, size, overflow: false };
    }
  }
  return { lines: splitLines(text, slot.maxLines), size: minSize, overflow: true };
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
 * Cachea el SVG rasterizado por combinacion de color/choice.
 *
 * Recolorear obliga a re-rasterizar, que es caro; el texto no. Sin cache, escribir
 * un nombre rasterizaria el SVG en cada pulsacion.
 */
export class DesignComposer {
  private cache = new Map<string, HTMLImageElement>();
  private assets: AssetLibrary;

  constructor(assets: AssetLibrary) {
    this.assets = assets;
  }

  private bakeKey(design: Design, values: SlotValues, scale: number): string {
    const parts = design.slots
      .filter((s) => s.type === "color")
      .map((s) => `${s.id}=${values[s.id] ?? ""}`);
    return `${design.id}|${scale}|${parts.join(",")}`;
  }

  /**
   * Dibuja el archivo de impresion plano. Misma llamada para el preview (escala
   * baja) y para la imprenta (escala 1 = 300 DPI).
   */
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

    const doc = parse(design.svg);
    const vb = viewBox(doc);
    const sx = w / vb.w;
    const sy = h / vb.h;

    const key = this.bakeKey(design, values, scale);
    let base = this.cache.get(key);
    if (!base) {
      base = await rasterize(bakeSvg(design, values), w, h);
      this.cache.set(key, base);
    }
    ctx.drawImage(base, 0, 0, w, h);

    const safeW = safeWidthFrac(design.safeAngleDeg, design.spec.wraps360) * w;
    let overflow = false;

    for (const slot of design.slots) {
      const r = placeholderRect(doc, slot.target);
      if (!r) continue;
      const box = { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };

      if (slot.type === "choice") {
        const img = this.assets.get(values[slot.id] ?? slot.default);
        if (img) ctx.drawImage(img, box.x, box.y, box.w, box.h);
      } else if (slot.type === "text") {
        const text = (values[slot.id] ?? "").trim();
        if (!text) continue;
        // El texto nunca puede exceder la zona segura, aunque su caja sea mas ancha.
        const maxW = Math.min(box.w, safeW);
        const fit = fitText(ctx, text, { w: maxW, h: box.h }, slot, h);
        overflow = overflow || fit.overflow;
        ctx.fillStyle = slot.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${fit.size}px ${slot.fontFamily}`;
        const lineH = fit.size * 1.1;
        const cy = box.y + box.h / 2 - ((fit.lines.length - 1) * lineH) / 2;
        fit.lines.forEach((line, i) =>
          ctx.fillText(line, box.x + box.w / 2, cy + i * lineH),
        );
      }
    }

    return { overflow };
  }
}
