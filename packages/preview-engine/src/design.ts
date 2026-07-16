import type { PrintSpec } from "./types";

/** Recolorea una capa del SVG. Lista fija de valores, nunca un picker libre. */
export interface ColorSlot {
  id: string;
  type: "color";
  label: string;
  /** data-slot del elemento en el SVG. */
  target: string;
  options: string[];
  default: string;
}

/** Intercambia el contenido de una capa desde un set curado. */
export interface ChoiceSlot {
  id: string;
  type: "choice";
  label: string;
  /** data-slot del placeholder que da posicion y tamano. */
  target: string;
  /** slugs de assets de la libreria. */
  options: string[];
  default: string;
}

export interface TextSlot {
  id: string;
  type: "text";
  label: string;
  target: string;
  maxChars: number;
  /** Minimo legible como fraccion del alto del archivo. */
  minSizeFrac: number;
  maxLines: number;
  color: string;
  fontFamily: string;
  placeholder?: string;
}

/** Reservado. Exige recorte de fondo; fuera de alcance de la etapa 1. */
export interface PhotoSlot {
  id: string;
  type: "photo";
  label: string;
  target: string;
}

export type Slot = ColorSlot | ChoiceSlot | TextSlot | PhotoSlot;

export interface Design {
  id: string;
  name: string;
  spec: PrintSpec;
  /** Documento por capas. Aporta formas y color, nunca texto (ver spec 4). */
  svg: string;
  slots: Slot[];
  /** Angulo visible legible. Define el ancho utilizable del archivo. */
  safeAngleDeg: number;
}

export type SlotValues = Record<string, string>;

/** Ancho utilizable del archivo: solo la porcion que se ve de frente. */
export function safeWidthFrac(safeAngleDeg: number, wraps360: boolean): number {
  return wraps360 ? (2 * safeAngleDeg) / 360 : 1;
}

export function defaultValues(design: Design): SlotValues {
  const v: SlotValues = {};
  for (const s of design.slots) {
    if (s.type === "color" || s.type === "choice") v[s.id] = s.default;
    else if (s.type === "text") v[s.id] = "";
  }
  return v;
}
