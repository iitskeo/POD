import { resolveGraphic, resolveImage, resolveText } from "./slots";
import type { Element, Placement, SlotValues, TextElement } from "./types";

/**
 * The app supplies drawable images; the engine stays pure. Graphics are recolored and
 * rasterized app-side (it owns the asset bytes and a cache); the engine only composes.
 */
export interface Resolver {
  graphic(assetId: string, color?: string): Promise<CanvasImageSource | null>;
  image(storageKey: string): Promise<CanvasImageSource | null>;
}

/** Recolor an SVG's data-recolor parts. Shared by the app's Resolver. */
export function recolorSvg(svg: string, part: string | undefined, color: string | undefined): string {
  if (!part || !color) return svg;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  doc.querySelectorAll(`[data-recolor="${part}"]`).forEach((el) => {
    el.setAttribute(el.getAttribute("data-recolor-paint") ?? "fill", color);
  });
  return new XMLSerializer().serializeToString(doc);
}

interface Fitted { lines: string[]; size: number; overflow: boolean }

/** Fit text into a box with a minimum legible size, wrapping to max lines. */
export function fitText(
  ctx: CanvasRenderingContext2D, text: string, boxW: number, boxH: number,
  el: Pick<TextElement, "font" | "maxLines" | "minSizeFrac" | "letterSpacing">, fileHeight: number,
): Fitted {
  const minSize = Math.max(6, el.minSizeFrac * fileHeight);
  const measure = (lines: string[], size: number) => {
    ctx.font = `700 ${size}px ${el.font}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width + (el.letterSpacing ?? 0) * Math.max(0, l.length - 1)));
  };
  for (let count = 1; count <= el.maxLines; count++) {
    const lines = wrap(text, count);
    if (lines.length !== count) continue;
    for (let size = boxH / count; size >= minSize; size -= 1) {
      if (measure(lines, size) <= boxW) return { lines, size, overflow: false };
    }
  }
  return { lines: wrap(text, el.maxLines), size: minSize, overflow: true };
}

function wrap(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count === 1 || words.length < count) return [text.trim()];
  const per = Math.ceil(words.length / count);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
  return lines;
}

function drawStyledLine(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, el: TextElement,
) {
  if (el.letterSpacing) {
    let cx = x - measureSpaced(ctx, text, el.letterSpacing) / (el.align === "center" ? 2 : el.align === "right" ? 1 : Infinity);
    if (el.align === "left") cx = x;
    const startX = el.align === "left" ? x : cx;
    let px = startX;
    ctx.textAlign = "left";
    for (const ch of text) {
      strokeFill(ctx, ch, px, y, el);
      px += ctx.measureText(ch).width + el.letterSpacing;
    }
    return;
  }
  strokeFill(ctx, text, x, y, el);
}

function measureSpaced(ctx: CanvasRenderingContext2D, text: string, ls: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + ls;
  return w - ls;
}

function strokeFill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, el: TextElement) {
  if (el.shadow) {
    ctx.save();
    ctx.shadowColor = el.shadow.color; ctx.shadowBlur = el.shadow.blur;
    ctx.shadowOffsetX = el.shadow.dx; ctx.shadowOffsetY = el.shadow.dy;
  }
  if (el.outline && el.outline.width > 0) {
    ctx.lineWidth = el.outline.width; ctx.strokeStyle = el.outline.color;
    ctx.lineJoin = "round"; ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
  if (el.shadow) ctx.restore();
}

function drawArcText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, arcDeg: number, el: TextElement,
) {
  const total = (arcDeg * Math.PI) / 180;
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const textW = widths.reduce((a, b) => a + b, 0);
  const radius = textW / Math.max(total, 0.0001);
  let angle = -total / 2;
  ctx.textAlign = "center";
  for (let i = 0; i < text.length; i++) {
    const w = widths[i];
    angle += w / 2 / radius;
    ctx.save();
    ctx.translate(cx + radius * Math.sin(angle), cy - radius * Math.cos(angle) + radius);
    ctx.rotate(angle);
    strokeFill(ctx, text[i], 0, 0, el);
    ctx.restore();
    angle += w / 2 / radius;
  }
}

/**
 * Render one placement's artwork onto `canvas` in print-file coordinates at `scale`.
 *
 * scale = 1 gives the exact print file Printful prints; a smaller scale gives the live
 * editor/customizer preview. Same code path both ways: preview equals print.
 */
export async function renderArtwork(
  canvas: HTMLCanvasElement, placement: Placement, elements: Element[],
  values: SlotValues, resolver: Resolver, scale = 1,
): Promise<{ overflow: boolean }> {
  const W = Math.round(placement.printSpec.widthPx * scale);
  const H = Math.round(placement.printSpec.heightPx * scale);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const els = elements
    .filter((e) => e.placement === placement.placement && !e.hidden)
    .sort((a, b) => a.z - b.z);

  let overflow = false;
  for (const el of els) {
    const r = { x: el.rect.x * scale, y: el.rect.y * scale, w: el.rect.w * scale, h: el.rect.h * scale };
    ctx.save();
    if (el.rotation) {
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    }

    if (el.kind === "background") {
      if (el.fill.color) { ctx.fillStyle = el.fill.color; ctx.fillRect(0, 0, W, H); }
      else {
        const img = el.fill.storageKey ? await resolver.image(el.fill.storageKey)
          : el.fill.assetId ? await resolver.graphic(el.fill.assetId) : null;
        if (img) ctx.drawImage(img, 0, 0, W, H);
      }
    } else if (el.kind === "image") {
      const img = await resolver.image(resolveImage(el, values));
      if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
    } else if (el.kind === "graphic") {
      const { assetId, color } = resolveGraphic(el, values);
      const img = await resolver.graphic(assetId, color);
      if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
    } else if (el.kind === "pattern") {
      const src = el.source.storageKey ? await resolver.image(el.source.storageKey)
        : el.source.assetId ? await resolver.graphic(el.source.assetId, el.color) : null;
      if (src) tilePattern(ctx, src, el.type, el.scale * scale, el.spacing * scale, W, H);
    } else if (el.kind === "text") {
      const { content, color } = resolveText(el, values);
      if (content.trim()) {
        const fit = fitText(ctx, content, r.w, r.h, el, H);
        overflow = overflow || fit.overflow;
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.textAlign = el.align;
        ctx.font = `700 ${fit.size}px ${el.font}`;
        const ax = el.align === "left" ? r.x : el.align === "right" ? r.x + r.w : r.x + r.w / 2;
        if (el.arc && el.arc !== 0) {
          drawArcText(ctx, fit.lines[0], r.x + r.w / 2, r.y + r.h / 2, fit.size, el.arc, el);
        } else {
          const lineH = fit.size * 1.15;
          const top = r.y + r.h / 2 - ((fit.lines.length - 1) * lineH) / 2;
          fit.lines.forEach((line, i) => drawStyledLine(ctx, line, ax, top + i * lineH, el));
        }
      }
    }
    ctx.restore();
  }
  return { overflow };
}

function tilePattern(
  ctx: CanvasRenderingContext2D, src: CanvasImageSource, type: string,
  scale: number, spacing: number, W: number, H: number,
) {
  const base = 200 * scale;
  const stepX = base + spacing, stepY = base + spacing;
  let row = 0;
  for (let y = -stepY; y < H + stepY; y += stepY) {
    let offset = 0;
    if (type === "half_drop") offset = (row % 2) * (stepX / 2);
    if (type === "brick") offset = (row % 2) * (stepX / 2);
    for (let x = -stepX; x < W + stepX; x += stepX) {
      ctx.save();
      ctx.translate(x + offset, y);
      if (type === "reflect" && row % 2 === 1) { ctx.scale(1, -1); ctx.translate(0, -base); }
      if (type === "line_v") ctx.drawImage(src, 0, 0, base, H);
      else if (type === "line_h") ctx.drawImage(src, 0, 0, W, base);
      else ctx.drawImage(src, 0, 0, base, base);
      ctx.restore();
    }
    row++;
  }
}

/** Full-resolution print-file PNG for a placement (what Printful prints). */
export async function renderPrintFilePng(
  placement: Placement, elements: Element[], values: SlotValues, resolver: Resolver,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderArtwork(canvas, placement, elements, values, resolver, 1);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}
