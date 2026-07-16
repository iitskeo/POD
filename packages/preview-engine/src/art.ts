import type { PrintSpec } from "./types";

export interface TextZone {
  /** Alto de la caja de texto, como fraccion del alto del archivo. */
  heightFrac: number;
  /** Centro vertical de la caja, como fraccion del alto del archivo. */
  centerYFrac: number;
  maxChars: number;
  /** Minimo legible como fraccion del alto del archivo. Evita el nombre diminuto. */
  minSizeFrac: number;
  maxLines: number;
  color: string;
  fontFamily: string;
}

export interface IconZone {
  /** Lado de la caja del icono, como fraccion del alto del archivo. */
  sizeFrac: number;
  centerYFrac: number;
}

export interface ArtSelection {
  icon: CanvasImageSource | null;
  text: string;
}

export interface ArtLayout {
  spec: PrintSpec;
  iconZone: IconZone;
  textZone: TextZone;
  /** Angulo visible considerado legible. Define el ancho utilizable. */
  safeAngleDeg: number;
}

/** Ancho utilizable del archivo: solo la porcion que se ve de frente. */
export function safeWidthFrac(safeAngleDeg: number, wraps360: boolean): number {
  return wraps360 ? (2 * safeAngleDeg) / 360 : 1;
}

interface FittedText {
  lines: string[];
  size: number;
  /** true si ni con el minimo y todas las lineas cabe. */
  overflow: boolean;
}

/**
 * Ajusta el texto a la zona segura con tamano minimo.
 *
 * Encoger sin limite deja los nombres largos ilegibles (lo mostro el spike:
 * "MARIA FERNANDA" junto a "ANA"). Al tocar el minimo se parte en lineas.
 */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  zone: TextZone,
  fileHeight: number,
): FittedText {
  const minSize = zone.minSizeFrac * fileHeight;
  const maxSize = zone.heightFrac * fileHeight;

  const measure = (lines: string[], size: number) => {
    ctx.font = `700 ${size}px ${zone.fontFamily}`;
    return Math.max(...lines.map((l) => ctx.measureText(l).width));
  };

  for (let lineCount = 1; lineCount <= zone.maxLines; lineCount++) {
    const lines = splitLines(text, lineCount);
    if (lines.length !== lineCount) continue;
    const perLine = maxSize / lineCount;
    for (let size = perLine; size >= minSize; size -= 1) {
      if (measure(lines, size) <= maxWidth) return { lines, size, overflow: false };
    }
  }
  const lines = splitLines(text, zone.maxLines);
  return { lines, size: minSize, overflow: true };
}

function splitLines(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count === 1 || words.length < count) return [text.trim()];
  // Reparte palabras buscando lineas de largo parecido.
  const lines: string[] = [];
  const per = Math.ceil(words.length / count);
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
  return lines;
}

/**
 * Dibuja el archivo de impresion plano.
 *
 * Es la misma composicion para el preview y para la imprenta; solo cambia
 * `scale`. Que sea el mismo codigo es lo que garantiza que lo impreso coincide
 * con lo que el cliente aprobo (ver spec 4).
 */
export function drawArt(
  canvas: HTMLCanvasElement,
  layout: ArtLayout,
  sel: ArtSelection,
  scale = 1,
): { overflow: boolean } {
  const { spec, iconZone, textZone } = layout;
  const w = Math.round(spec.widthPx * scale);
  const h = Math.round(spec.heightPx * scale);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const safeW = safeWidthFrac(layout.safeAngleDeg, spec.wraps360) * w;

  if (sel.icon) {
    const size = iconZone.sizeFrac * h;
    ctx.drawImage(sel.icon, cx - size / 2, iconZone.centerYFrac * h - size / 2, size, size);
  }

  let overflow = false;
  const text = sel.text.trim();
  if (text) {
    const fit = fitText(ctx, text, safeW, textZone, h);
    overflow = fit.overflow;
    ctx.fillStyle = textZone.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fit.size}px ${textZone.fontFamily}`;
    const lineH = fit.size * 1.1;
    const top = textZone.centerYFrac * h - ((fit.lines.length - 1) * lineH) / 2;
    fit.lines.forEach((line, i) => ctx.fillText(line, cx, top + i * lineH));
  }

  return { overflow };
}
