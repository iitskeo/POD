import type { PrintSpec } from "./types";

/** Rectangulo en coordenadas del archivo de impresion (px del spec). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Deja que el cliente elija que asset va en este hueco, de un set curado. */
export interface ChoiceSlot {
  label: string;
  /** slugs de la libreria. */
  options: string[];
}

/**
 * Recolorea una parte del SVG del asset (las marcadas con data-recolor).
 * Opciones fijas definidas por el admin, nunca un picker libre: es lo que hace
 * que la regla de un solo acento por composicion no se pueda romper.
 */
export interface RecolorSlot {
  /** valor de data-recolor dentro del SVG del asset. */
  part: string;
  label: string;
  options: string[];
  default: string;
}

export interface AssetElement {
  id: string;
  kind: "asset";
  rect: Rect;
  /** Asset por defecto, y el unico si no hay choice. */
  slug: string;
  /** Si falta, el asset es fijo y el cliente no lo cambia. */
  choice?: ChoiceSlot;
  recolor: RecolorSlot[];
}

export interface TextElement {
  id: string;
  kind: "text";
  rect: Rect;
  label: string;
  maxChars: number;
  /** Minimo legible como fraccion del alto del archivo. */
  minSizeFrac: number;
  maxLines: number;
  color: string;
  fontFamily: string;
  placeholder: string;
  /** Si está, el texto es fijo y el cliente no lo edita. */
  fixed?: string;
}

/** Reservado. Exige recorte de fondo; fuera de alcance de la etapa 1. */
export interface PhotoElement {
  id: string;
  kind: "photo";
  rect: Rect;
  label: string;
}

export type DesignElement = AssetElement | TextElement | PhotoElement;

export interface Design {
  id: string;
  name: string;
  spec: PrintSpec;
  /** Angulo visible legible. Define el ancho utilizable del archivo. */
  safeAngleDeg: number;
  /** Arte fijo de fondo. Siempre se imprime tal cual; nunca es personalizable. */
  baseImage?: string;
  /** Se dibujan en orden. El primero queda al fondo. */
  elements: DesignElement[];
}

/**
 * Valores elegidos por el cliente.
 * Claves: `<elementId>` para choice y text, `<elementId>.<part>` para recolor.
 */
export type SlotValues = Record<string, string>;

export function defaultValues(design: Design): SlotValues {
  const v: SlotValues = {};
  for (const el of design.elements) {
    if (el.kind === "asset") {
      if (el.choice) v[el.id] = el.slug;
      for (const r of el.recolor) v[`${el.id}.${r.part}`] = r.default;
    } else if (el.kind === "text" && !el.fixed) {
      v[el.id] = "";
    }
  }
  return v;
}

/**
 * Fraccion del ancho del archivo que se ve de frente.
 *
 * El archivo cubre `wrapDegrees` del producto; de esos, solo son legibles los
 * `2*safeAngleDeg` centrales. Si el archivo envuelve menos que la zona legible,
 * se ve entero.
 */
export function safeWidthFrac(safeAngleDeg: number, wrapDegrees: number | null): number {
  if (!wrapDegrees) return 1; // superficie plana: no hay curvatura que recorte
  return Math.min(1, (2 * safeAngleDeg) / wrapDegrees);
}

/** Rectangulo de la zona segura, en coordenadas del archivo. */
export function safeRect(design: Design): Rect {
  const w = design.spec.widthPx * safeWidthFrac(design.safeAngleDeg, design.spec.wrapDegrees);
  return { x: (design.spec.widthPx - w) / 2, y: 0, w, h: design.spec.heightPx };
}
