/** Perfil R(y) de un solido de revolucion, extraido de la silueta de la foto. */
export interface Profile {
  /** Primera fila del cuerpo imprimible (por debajo de la tapa). */
  yTop: number;
  /** Ultima fila del cuerpo. */
  yBot: number;
  /** Eje de revolucion en px. */
  cx: number;
  /** Radio maximo en px. Da la escala: 2*Rmax equivale al diametro fisico. */
  rMax: number;
  /** Radio por fila, indexado por y absoluto. 0 fuera del cuerpo. */
  radii: Float32Array;
  width: number;
  height: number;
}

/** Medidas del archivo de impresion, tomadas del template del proveedor. */
export interface PrintSpec {
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** El ancho del archivo es la circunferencia completa (envoltura 360). */
  wraps360: boolean;
  /** Margen de sangrado del proveedor, en px del archivo. */
  bleedPx: number;
}

/** Banda imprimible sobre la foto. La silueta no la da: el admin la marca. */
export interface PrintBand {
  /** Fila donde empieza la banda. */
  yStart: number;
  /** Alto de la banda en px de la foto. Deriva de printSpec y la escala. */
  height: number;
}

export interface Calibration {
  /** Fuerza del multiply de shading. 1 = la foto tal cual. */
  shadingStrength: number;
  /** Angulo maximo considerado legible. Define la zona segura. */
  safeAngleDeg: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  shadingStrength: 1,
  safeAngleDeg: 45,
};

/** Wine Tumbler 11oz de Printify. Medidas leidas del template oficial. */
export const WINE_TUMBLER_11OZ: PrintSpec = {
  widthPx: 3278,
  heightPx: 900,
  dpi: 300,
  wraps360: true,
  bleedPx: 57,
};
