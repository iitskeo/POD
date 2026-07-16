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
  /**
   * Cuantos grados del producto cubre el ancho del archivo.
   *
   * No es un si/no. El Wine Tumbler envuelve ~360 pero una taza con asa solo ~320:
   * su area imprimible son 9in sobre ~10in de circunferencia. Tratarlo como booleano
   * mapeaba mal todo lo que no diera la vuelta completa.
   *
   * 360 en un cilindro cerrado; menos cuando el asa o una costura se comen el resto.
   * En superficies planas (camisetas) no aplica: usar `null`.
   */
  wrapDegrees: number | null;
  /** Margen de sangrado del proveedor, en px del archivo. */
  bleedPx: number;
}

/** Grados que cubre un archivo de `widthIn` sobre un producto de `diameterIn`. */
export function wrapDegreesFor(widthIn: number, diameterIn: number): number {
  return Math.min(360, (widthIn / (Math.PI * diameterIn)) * 360);
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

/**
 * Wine Tumbler de Printful (12oz, tecnica UV).
 *
 * Medidas leidas de la API: 10.58 x 3.17 in a 300 dpi. Ojo: el mismo producto en
 * Printify traia 10.93 x 3.00 in por sublimacion. El spec pertenece al proveedor,
 * no al producto, y por eso lo trae el import.
 *
 * Semilla hasta que el import de Printful exista.
 */
export const WINE_TUMBLER: PrintSpec = {
  widthPx: 3175,
  heightPx: 950,
  dpi: 300,
  // 10.58in sobre un vaso de ~3.37in de diametro: da casi la vuelta completa.
  wrapDegrees: 360,
  bleedPx: 57,
};
