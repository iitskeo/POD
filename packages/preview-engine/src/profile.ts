import type { Profile } from "./types";

export interface ProfileOptions {
  /** Color distance from the background to count as object. */
  bgThreshold: number;
  /** Minimum luminance of the printable body (white). */
  bodyLuma: number;
  /** Maximum saturation of the body (rejects the metal lid). */
  bodySat: number;
  /** Fraction of white pixels a body row must have. */
  bodyWhiteFrac: number;
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = {
  bgThreshold: 18,
  bodyLuma: 195,
  bodySat: 18,
  bodyWhiteFrac: 0.75,
};

/**
 * Extracts R(y) from the product's silhouette against the background.
 *
 * On a solid of revolution the silhouette IS the profile: the visible edge is the
 * tangency point, so its distance to the axis is the radius at that height. This is
 * why the geometry is not derived from luminance (see spec 4.2.1).
 */
export function extractProfile(
  img: ImageData,
  opts: ProfileOptions = DEFAULT_PROFILE_OPTIONS,
): Profile {
  const { width, height, data } = img;

  // Background is sampled from the corner: provider mockups use a flat backdrop.
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

  // Body rows: mostly white and wide enough. This separates the printable body
  // from the steel lid.
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
  if (bodyRows.length === 0) throw new Error("Could not detect the product body");

  const yTop = bodyRows[0];
  const yBot = bodyRows[bodyRows.length - 1];

  // The radius is measured across the WHOLE body band, not only the rows that passed
  // the test above. That test locates the body and separates it from the lid;
  // measuring is a different job. Lower down the shadow drops the luminance and those
  // rows fail the test, but they are still body and still need a radius: without one
  // the shader discards them (r < 1) and the design gets cut off mid-height.
  const radii = new Float32Array(height);
  const centers: number[] = [];
  for (let y = yTop; y <= yBot; y++) {
    let minX = -1, maxX = -1;
    for (let x = 0; x < width; x++) {
      if (white[y * width + x]) { if (minX < 0) minX = x; maxX = x; }
    }
    // Fall back to the silhouette against the background: inside the band the object
    // IS the body, so it works when the white test falls short.
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

/** Photo pixels per inch, derived from 2*rMax being the physical diameter. */
export function pixelsPerInch(profile: Profile, diameterInches: number): number {
  return (profile.rMax * 2) / diameterInches;
}

/**
 * Product diameter implied by a print file `printWidthInches` wide that goes
 * `wrapDegrees` around it.
 *
 * The file width is only the full circumference at 360. A 9.32in file that wraps 305
 * implies an 11in circumference, not 9.32: assuming a full turn shrinks the implied
 * diameter and every measurement derived from it, including the print band's height.
 */
export function diameterFromWrap(printWidthInches: number, wrapDegrees = 360): number {
  const circumference = printWidthInches * (360 / wrapDegrees);
  return circumference / Math.PI;
}
