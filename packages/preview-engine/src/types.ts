/** R(y) profile of a solid of revolution, extracted from the photo's silhouette. */
export interface Profile {
  /** First row of the printable body (below the lid). */
  yTop: number;
  /** Last row of the body. */
  yBot: number;
  /** Axis of revolution, in px. */
  cx: number;
  /** Max radius in px. Sets the scale: 2*rMax equals the physical diameter. */
  rMax: number;
  /** Radius per row, indexed by absolute y. 0 outside the body. */
  radii: Float32Array;
  width: number;
  height: number;
}

/** Print file measurements, taken from the provider's template. */
export interface PrintSpec {
  widthPx: number;
  heightPx: number;
  dpi: number;
  /**
   * How many degrees of the product the file's width covers.
   *
   * Not a yes/no. The Wine Tumbler wraps ~360 but a mug with a handle only ~320: its
   * print area is 9in over a ~10in circumference. As a boolean, anything short of a
   * full turn was mapped wrong.
   *
   * 360 on a closed cylinder; less when a handle or seam eats the rest. Flat surfaces
   * (tees) do not apply: use `null`.
   */
  wrapDegrees: number | null;
  /** Provider bleed margin, in file px. */
  bleedPx: number;
}

/** Degrees a `widthIn` file covers on a product of `diameterIn`. */
export function wrapDegreesFor(widthIn: number, diameterIn: number): number {
  return Math.min(360, (widthIn / (Math.PI * diameterIn)) * 360);
}

/** Printable band over the photo. The silhouette does not give it: the admin marks it. */
export interface PrintBand {
  /** Row where the band starts. */
  yStart: number;
  /** Band height in photo px. Derived from printSpec and the scale. */
  height: number;
}

export interface Calibration {
  /** Strength of the shading multiply. 1 = the photo as-is. */
  shadingStrength: number;
  /** Max angle considered legible. Defines the safe zone. */
  safeAngleDeg: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  shadingStrength: 1,
  safeAngleDeg: 45,
};

/**
 * Printful's Wine Tumbler (12oz, UV technique).
 *
 * Measurements read from the API: 10.58 x 3.17 in at 300 dpi. Note the same product on
 * Printify came as 10.93 x 3.00 in via sublimation. The spec belongs to the provider,
 * not the product, which is why the import carries it.
 *
 * Seed until the Printful import exists.
 */
export const WINE_TUMBLER: PrintSpec = {
  widthPx: 3175,
  heightPx: 950,
  dpi: 300,
  // 10.58in on a ~3.37in diameter cup: very nearly a full turn.
  wrapDegrees: 360,
  bleedPx: 57,
};
