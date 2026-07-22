import {
  call,
  fetchAllVariants,
  fetchPrintfiles,
  fetchTemplatesAll,
  type PlacementTemplate,
  type PrintFileStyle,
  type StoreRow,
  type VariantRow,
} from "./printful";
import type { Env } from "./index";

/** Spec Placement (docs/pod/05 section 3.1) as stored on products.placements. */
export interface Placement {
  placement: string;
  imageUrl: string;
  backgroundColor: string | null;
  templateWidth: number;
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number };
  printSpec: { widthPx: number; heightPx: number; dpi: number };
  technique: string;
}

export interface Variant {
  id: number;
  size: string | null;
  color: string | null;
  colorCode: string | null;
  image: string;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

/** Merge template placements with printfile sizes and per-placement techniques. */
function buildPlacements(
  templates: PlacementTemplate[],
  printfiles: Map<string, { widthPx: number; heightPx: number; dpi: number }>,
  techniques: Map<string, string>,
  fallbackTechnique: string,
): Placement[] {
  return templates.map((t) => {
    const pf = printfiles.get(t.placement);
    // Fall back to print-area px derived from the template if printfiles lacks it.
    // Strip the placement field: printSpec is just {widthPx, heightPx, dpi} (spec 3.1).
    const printSpec = pf
      ? { widthPx: pf.widthPx, heightPx: pf.heightPx, dpi: pf.dpi }
      : { widthPx: t.printArea.width, heightPx: t.printArea.height, dpi: 150 };
    return {
      placement: t.placement,
      imageUrl: t.imageUrl,
      backgroundColor: t.backgroundColor,
      templateWidth: t.templateWidth,
      templateHeight: t.templateHeight,
      printArea: t.printArea,
      printSpec,
      technique: techniques.get(t.placement) ?? fallbackTechnique,
    };
  });
}

interface ImportResult {
  productId: string;
  designId: string;
}

/**
 * One-click import (M2): fetch product, ALL variants, prices, templates + printfiles
 * for ALL placements in one pass; store base imagery in R2; persist the product with
 * per-placement print specs and variant templates; create an empty design.
 */
export async function importProduct(
  env: Env,
  store: StoreRow,
  catalogProductId: number,
  region: string,
): Promise<ImportResult> {
  const rq = `selling_region_name=${encodeURIComponent(region)}`;

  const [prodRes, stylesRes, variants, templates, pricesRes] = await Promise.all([
    call<{ data?: { name: string; techniques?: Array<{ key: string }> } }>(
      env, store, `/v2/catalog-products/${catalogProductId}?${rq}`,
    ),
    call<{ data?: PrintFileStyle[] }>(
      env, store, `/v2/catalog-products/${catalogProductId}/mockup-styles?${rq}`,
    ).catch(() => ({ data: [] as PrintFileStyle[] })),
    fetchAllVariants(env, store, catalogProductId, region),
    fetchTemplatesAll(store, catalogProductId),
    call<{ data?: unknown }>(env, store, `/v2/catalog-products/${catalogProductId}/prices?${rq}`)
      .catch(() => ({ data: null })),
  ]);

  const product = prodRes.data ?? { name: `Product ${catalogProductId}` };
  if (!templates) {
    throw new Error("This product has no print template and cannot be customized.");
  }
  if (variants.length === 0) throw new Error("Printful returned no variants.");

  const representative = variants[0];
  const printfileSizes = await fetchPrintfiles(store, catalogProductId, representative.id);
  const printfiles = new Map(printfileSizes.map((p) => [p.placement, p]));
  const techniques = new Map((stylesRes.data ?? []).map((s) => [s.placement, s.technique]));
  const fallbackTechnique = product.techniques?.[0]?.key ?? "dtg";

  const placements = buildPlacements(templates.base, printfiles, techniques, fallbackTechnique);

  // variant_templates: only variants whose imagery differs from the representative.
  const baseKey = JSON.stringify(templates.base.map((p) => `${p.placement}:${p.imageUrl}`));
  const variantTemplates: Record<number, Placement[]> = {};
  for (const [variantId, pls] of Object.entries(templates.byVariant)) {
    const key = JSON.stringify(pls.map((p) => `${p.placement}:${p.imageUrl}`));
    if (key !== baseKey) {
      variantTemplates[Number(variantId)] =
        buildPlacements(pls, printfiles, techniques, fallbackTechnique);
    }
  }

  const variantList: Variant[] = variants.map((v: VariantRow) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    colorCode: v.color_code,
    image: v.image,
  }));

  // Store the representative variant's photo in R2 for the base image.
  const productId = `printful-${catalogProductId}-${representative.id}`;
  let photoKey: string | null = null;
  if (representative.image) {
    const photo = await fetch(representative.image);
    if (photo.ok) {
      photoKey = `products/${productId}/${representative.id}/photo`;
      await env.BUCKET.put(photoKey, await photo.arrayBuffer(), {
        httpMetadata: { contentType: photo.headers.get("Content-Type") ?? "image/jpeg" },
      });
    }
  }

  const now = Date.now();
  const techniqueList = [...new Set(placements.map((p) => p.technique))];
  const priceRef = pickPrice(pricesRes.data);

  await env.DB.prepare(
    `INSERT INTO products
       (id, slug, name, status, source, external_product_id, external_variant_id,
        photo_key, retail_price_cents, currency, placements, variant_templates,
        variants, techniques, store_id, created_at, updated_at)
     VALUES (?1,?2,?3,'draft','printful',?4,?5,?6,?7,'USD',?8,?9,?10,?11,?12,?13,?13)
     ON CONFLICT(id) DO UPDATE SET
       name=?3, photo_key=?6, placements=?8, variant_templates=?9, variants=?10,
       techniques=?11, updated_at=?13`,
  ).bind(
    productId,
    slugify(`${product.name}-${catalogProductId}`),
    product.name,
    String(catalogProductId),
    String(representative.id),
    photoKey,
    priceRef,
    JSON.stringify(placements),
    Object.keys(variantTemplates).length ? JSON.stringify(variantTemplates) : null,
    JSON.stringify(variantList),
    JSON.stringify(techniqueList),
    store.id,
    now,
  ).run();

  // Create the empty design if the product has none yet.
  const designId = `design-${productId}`;
  await env.DB.prepare(
    `INSERT INTO designs (id, product_id, name, status, elements, created_at, updated_at)
     VALUES (?1,?2,?3,'draft','[]',?4,?4)
     ON CONFLICT(product_id) DO NOTHING`,
  ).bind(designId, productId, product.name, now).run();

  return { productId, designId };
}

/** A representative reference price (min variant price), just for owner context. */
function pickPrice(prices: unknown): number {
  try {
    const p = prices as { variants?: Array<{ techniques?: Array<{ price?: string }> }> };
    const all = (p.variants ?? []).flatMap((v) =>
      (v.techniques ?? []).map((t) => Math.round(Number(t.price ?? 0) * 100)),
    ).filter((n) => n > 0);
    return all.length ? Math.min(...all) : 0;
  } catch {
    return 0;
  }
}
