import type { Profile } from "./types";

export interface ProfileOptions {
  /** Distancia de color al fondo para considerar que hay objeto. */
  bgThreshold: number;
  /** Luminancia minima del cuerpo imprimible (blanco). */
  bodyLuma: number;
  /** Saturacion maxima del cuerpo (descarta la tapa metalica). */
  bodySat: number;
  /** Fraccion de pixeles blancos que debe tener una fila del cuerpo. */
  bodyWhiteFrac: number;
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = {
  bgThreshold: 18,
  bodyLuma: 195,
  bodySat: 18,
  bodyWhiteFrac: 0.75,
};

/**
 * Extrae R(y) de la silueta del producto contra el fondo.
 *
 * En un solido de revolucion la silueta ES el perfil: el borde visible es el
 * punto de tangencia, asi que su distancia al eje es el radio a esa altura.
 * Por eso la geometria no se deriva de la luminancia (ver spec 4.2.1).
 */
export function extractProfile(
  img: ImageData,
  opts: ProfileOptions = DEFAULT_PROFILE_OPTIONS,
): Profile {
  const { width, height, data } = img;

  // El fondo se muestrea en la esquina: los mockups de proveedor son fondo plano.
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * width + x) * 4;
      br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n++;
    }
  }
  br /= n; bg /= n; bb /= n;

  const white = new Uint8Array(width * height);
  const isObj = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const d = Math.hypot(r - br, g - bg, b - bb);
      if (d <= opts.bgThreshold) continue;
      isObj[p] = 1;
      const luma = (r + g + b) / 3;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (luma > opts.bodyLuma && sat < opts.bodySat) white[p] = 1;
    }
  }

  // Filas del cuerpo: mayoritariamente blancas y suficientemente anchas.
  // Esto separa el cuerpo imprimible de la tapa de acero.
  const bodyRows: number[] = [];
  for (let y = 0; y < height; y++) {
    let obj = 0, wht = 0, minX = -1, maxX = -1;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (isObj[p]) { obj++; if (minX < 0) minX = x; maxX = x; }
      if (white[p]) wht++;
    }
    if (obj < 4) continue;
    if (wht / obj > opts.bodyWhiteFrac && maxX - minX > width * 0.25) bodyRows.push(y);
  }
  if (bodyRows.length === 0) throw new Error("No se detecto el cuerpo del producto");

  const yTop = bodyRows[0];
  const yBot = bodyRows[bodyRows.length - 1];

  // El radio se mide en TODA la franja del cuerpo, no solo en las filas que
  // pasaron el test de arriba. Ese test sirve para localizar el cuerpo y separarlo
  // de la tapa; medir es otra cosa. Hacia abajo la sombra baja la luminancia y esas
  // filas no pasan el test, pero siguen siendo cuerpo y necesitan su radio: sin el,
  // el shader las descarta (r < 1) y el diseño se corta a media altura.
  const radii = new Float32Array(height);
  const centers: number[] = [];
  for (let y = yTop; y <= yBot; y++) {
    let minX = -1, maxX = -1;
    for (let x = 0; x < width; x++) {
      if (white[y * width + x]) { if (minX < 0) minX = x; maxX = x; }
    }
    // Fallback a la silueta contra el fondo: dentro de la franja, el objeto
    // ES el cuerpo, asi que sirve cuando el test de blanco se queda corto.
    if (minX < 0 || maxX - minX < 4) {
      minX = -1; maxX = -1;
      for (let x = 0; x < width; x++) {
        if (isObj[y * width + x]) { if (minX < 0) minX = x; maxX = x; }
      }
    }
    if (minX < 0 || maxX - minX < 4) continue;
    radii[y] = (maxX - minX) / 2;
    centers.push((minX + maxX) / 2);
  }

  centers.sort((a, b) => a - b);
  const cx = centers[Math.floor(centers.length / 2)];
  let rMax = 0;
  for (const r of radii) if (r > rMax) rMax = r;

  return { yTop, yBot, cx, rMax, radii, width, height };
}

/** px por pulgada de la foto, derivado de que 2*rMax es el diametro fisico. */
export function pixelsPerInch(profile: Profile, diameterInches: number): number {
  return (profile.rMax * 2) / diameterInches;
}

/** Diametro implicito cuando el ancho del archivo es la circunferencia. */
export function diameterFromWrap(printWidthInches: number): number {
  return printWidthInches / Math.PI;
}
