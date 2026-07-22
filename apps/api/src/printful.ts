import type { Env } from "./index";

const AUTH_URL = "https://www.printful.com/oauth/authorize";
const TOKEN_URL = "https://www.printful.com/oauth/token";
const API = "https://api.printful.com";

export interface StoreRow {
  id: string;
  external_id: string | null;
  name: string | null;
  /** Mutable: `call` updates it on refresh. */
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}

/** A Printful catalog category. */
export interface Category {
  id: number;
  parent_id: number | null;
  title: string;
}

export function authorizeUrl(env: Env, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", env.PRINTFUL_CLIENT_ID);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_url", redirectUri(env));
  return u.toString();
}

export function redirectUri(env: Env): string {
  return env.PRINTFUL_REDIRECT_URI ?? "http://localhost:8787/api/printful/callback";
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeCode(env: Env, code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.PRINTFUL_CLIENT_ID,
      client_secret: env.PRINTFUL_CLIENT_SECRET,
      redirect_uri: redirectUri(env),
      code,
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Printful rejected the code: ${JSON.stringify(body).slice(0, 300)}`);
  }
  // Printful wraps some responses in { result: ... }; others not.
  const data = (body.result ?? body) as TokenResponse;
  if (!data.access_token) throw new Error("Printful returned no access_token");
  return data;
}

async function refresh(env: Env, store: StoreRow): Promise<string> {
  if (!store.refresh_token) {
    throw new Error("The token expired and there is no refresh_token. Reconnect Printful.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.PRINTFUL_CLIENT_ID,
      client_secret: env.PRINTFUL_CLIENT_SECRET,
      refresh_token: store.refresh_token,
    }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Could not refresh the token: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const tok = (body.result ?? body) as TokenResponse;
  if (!tok.access_token) throw new Error("The refresh returned no access_token");

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE stores SET access_token = ?1, refresh_token = ?2, expires_at = ?3, updated_at = ?4
     WHERE id = ?5`,
  ).bind(
    tok.access_token,
    tok.refresh_token ?? store.refresh_token,
    tok.expires_in ? now + tok.expires_in * 1000 : null,
    now,
    store.id,
  ).run();

  store.access_token = tok.access_token;
  return tok.access_token;
}

async function raw(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, body };
}

/**
 * Calls the Printful API, refreshing the token when needed.
 *
 * Printful tokens expire. Without this the connection works for a while and then
 * starts returning 401 with no explanation, needing a manual reconnect every time.
 */
export async function call<T>(env: Env, store: StoreRow, path: string): Promise<T> {
  // Preemptive refresh: 60s of slack so we do not race the clock.
  if (store.expires_at && store.expires_at - 60_000 < Date.now()) {
    await refresh(env, store);
  }

  let { res, body } = await raw(store.access_token, path);

  // Reactive: expires_at can be missing or wrong, and the 401 is the only truth.
  if (res.status === 401) {
    await refresh(env, store);
    ({ res, body } = await raw(store.access_token, path));
  }

  if (!res.ok) {
    const msg = (body.error as { message?: string })?.message ?? JSON.stringify(body).slice(0, 200);
    throw new Error(`Printful ${res.status}: ${msg}`);
  }
  return body as T;
}

export interface CatalogProduct {
  id: number;
  name: string;
  brand: string | null;
  image: string;
  variant_count: number;
  techniques?: Array<{ key: string; display_name: string }>;
}

export interface CatalogPage {
  data: CatalogProduct[];
  paging?: { total: number; offset: number; limit: number };
}

/** Valid Printful selling regions. Note there is no "usa": it is "north_america". */
export const SELLING_REGIONS = [
  "worldwide", "north_america", "canada", "europe", "spain", "latvia", "uk",
  "france", "germany", "australia", "japan", "new_zealand", "italy", "brazil",
  "southeast_asia", "republic_of_korea", "all",
] as const;

/** A `placement: "default"` mockup style: the print file's real measurements. */
export interface PrintFileStyle {
  placement: string;
  technique: string;
  print_area_width: number;
  print_area_height: number;
  dpi: number;
  mockup_styles?: Array<{ id: number; view_name: string; category_name: string }>;
}

/**
 * Degrees of the product covered by a print file `widthIn` wide.
 *
 * Printful gives the print width but not the product's diameter, so the wrap cannot
 * be derived: a 9in file is a full turn on a small cup and a third of a big one.
 * Cylinders default to 360 and the admin corrects it against the preview; that is a
 * visible, cheap mistake, whereas guessing a diameter would be an invisible one.
 */
export function defaultWrapDegrees(technique: string): number | null {
  // UV and sublimation on drinkware wrap the body; DTG and embroidery are flat.
  const cylindrical = ["uv", "uv-cylinder", "sublimation"];
  return cylindrical.includes(technique.toLowerCase()) ? 360 : null;
}

/** One placement's flat template: the product photo plus the print-area rectangle. */
export interface PlacementTemplate {
  placement: string;
  imageUrl: string;
  backgroundColor: string | null;
  templateWidth: number;
  templateHeight: number;
  printArea: { top: number; left: number; width: number; height: number };
}

export interface ProductTemplate {
  variantId: number;
  placements: PlacementTemplate[];
}

interface V1TemplateRow {
  template_id: number;
  image_url: string | null;
  background_color: string | null;
  template_width: number;
  template_height: number;
  print_area_width: number;
  print_area_height: number;
  print_area_top: number;
  print_area_left: number;
}

interface V1TemplatesResult {
  result: {
    variant_mapping: Array<{ variant_id: number; templates: Array<{ placement: string; template_id: number }> }>;
    templates: V1TemplateRow[];
  };
}

/**
 * The v1 templates endpoint gives the print-area position on the product photo, which
 * v2 does not. It is what lets the editor draw the design on the real product live.
 */
export async function fetchTemplate(
  store: StoreRow,
  catalogProductId: number,
  variantId: number,
): Promise<ProductTemplate | null> {
  const res = await fetch(
    `https://api.printful.com/mockup-generator/templates/${catalogProductId}`,
    { headers: { Authorization: `Bearer ${store.access_token}` } },
  );
  if (!res.ok) return null;
  const { result } = (await res.json()) as V1TemplatesResult;

  const mapping = result.variant_mapping.find((m) => m.variant_id === variantId)
    ?? result.variant_mapping[0];
  if (!mapping) return null;
  const byId = new Map(result.templates.map((t) => [t.template_id, t]));

  const placements: PlacementTemplate[] = [];
  for (const { placement, template_id } of mapping.templates) {
    const t = byId.get(template_id);
    if (!t?.image_url) continue;
    placements.push({
      placement,
      imageUrl: t.image_url,
      backgroundColor: t.background_color,
      templateWidth: t.template_width,
      templateHeight: t.template_height,
      printArea: {
        top: t.print_area_top,
        left: t.print_area_left,
        width: t.print_area_width,
        height: t.print_area_height,
      },
    });
  }
  return placements.length ? { variantId: mapping.variant_id, placements } : null;
}

/** Exact print-file pixel size + DPI for one placement (from the printfiles endpoint). */
export interface PrintfileSize {
  placement: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

interface V1PrintfilesResult {
  result: {
    printfiles: Array<{ printfile_id: number; width: number; height: number; dpi: number }>;
    variant_printfiles: Array<{ variant_id: number; placements: Record<string, number> }>;
    available_placements?: Record<string, string>;
  };
}

/**
 * Exact print-file dimensions per placement for a variant.
 *
 * mockup-styles gives the print AREA in inches; printfiles gives the real px canvas
 * Printful expects — the true "downloadable template" size. Needed so the composed PNG
 * matches what Printful prints.
 */
export async function fetchPrintfiles(
  store: StoreRow,
  catalogProductId: number,
  variantId: number,
): Promise<PrintfileSize[]> {
  const res = await fetch(
    `https://api.printful.com/mockup-generator/printfiles/${catalogProductId}`,
    { headers: { Authorization: `Bearer ${store.access_token}` } },
  );
  if (!res.ok) return [];
  const { result } = (await res.json()) as V1PrintfilesResult;
  const byId = new Map(result.printfiles.map((p) => [p.printfile_id, p]));
  const vp = result.variant_printfiles.find((v) => v.variant_id === variantId)
    ?? result.variant_printfiles[0];
  if (!vp) return [];

  const out: PrintfileSize[] = [];
  for (const [placement, printfileId] of Object.entries(vp.placements)) {
    const pf = byId.get(printfileId);
    if (!pf) continue;
    out.push({ placement, widthPx: pf.width, heightPx: pf.height, dpi: pf.dpi });
  }
  return out;
}

/** A catalog variant with its swatch, as stored on the product. */
export interface VariantRow {
  id: number;
  size: string | null;
  color: string | null;
  color_code: string | null;
  image: string;
}

/** Every variant of a product, paging past Printful's 100-per-page cap. */
export async function fetchAllVariants(
  env: Env,
  store: StoreRow,
  catalogProductId: number,
  region: string,
): Promise<VariantRow[]> {
  const rq = `selling_region_name=${encodeURIComponent(region)}`;
  const first = await call<{ data: VariantRow[]; paging?: { total: number } }>(
    env, store, `/v2/catalog-products/${catalogProductId}/catalog-variants?${rq}&limit=100&offset=0`,
  );
  const total = first.paging?.total ?? first.data.length;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, Math.ceil((total - 100) / 100)) }, (_, i) =>
      call<{ data: VariantRow[] }>(
        env, store,
        `/v2/catalog-products/${catalogProductId}/catalog-variants?${rq}&limit=100&offset=${(i + 1) * 100}`,
      ),
    ),
  );
  return [...first.data, ...rest.flatMap((r) => r.data)];
}

/**
 * Templates for every variant in one call.
 *
 * The templates endpoint already returns the mapping for all variants plus every
 * template row, so per-color imagery costs a single request, not one per color.
 * Returns the representative placements and, per variant, its placements — the caller
 * stores only the variants whose imagery differs (spec `variant_templates`).
 */
export async function fetchTemplatesAll(
  store: StoreRow,
  catalogProductId: number,
): Promise<{ base: PlacementTemplate[]; byVariant: Record<number, PlacementTemplate[]> } | null> {
  const res = await fetch(
    `https://api.printful.com/mockup-generator/templates/${catalogProductId}`,
    { headers: { Authorization: `Bearer ${store.access_token}` } },
  );
  if (!res.ok) return null;
  const { result } = (await res.json()) as V1TemplatesResult;
  const byId = new Map(result.templates.map((t) => [t.template_id, t]));

  const toPlacements = (maps: Array<{ placement: string; template_id: number }>): PlacementTemplate[] => {
    const out: PlacementTemplate[] = [];
    for (const { placement, template_id } of maps) {
      const t = byId.get(template_id);
      if (!t?.image_url) continue;
      out.push({
        placement,
        imageUrl: t.image_url,
        backgroundColor: t.background_color,
        templateWidth: t.template_width,
        templateHeight: t.template_height,
        printArea: {
          top: t.print_area_top, left: t.print_area_left,
          width: t.print_area_width, height: t.print_area_height,
        },
      });
    }
    return out;
  };

  const byVariant: Record<number, PlacementTemplate[]> = {};
  for (const m of result.variant_mapping) {
    const pls = toPlacements(m.templates);
    if (pls.length) byVariant[m.variant_id] = pls;
  }
  const base = byVariant[result.variant_mapping[0]?.variant_id] ?? Object.values(byVariant)[0] ?? [];
  return base.length ? { base, byVariant } : null;
}

export interface MockupTask {
  id: number;
  status: "pending" | "completed" | "failed";
  catalog_variant_mockups?: Array<{
    catalog_variant_id: number;
    mockups: Array<{ placement: string; style_id: number; mockup_url: string }>;
  }>;
  failure_reasons?: string[];
}

/** Creates a mockup task. Async: the result is polled, not returned. */
export async function createMockupTask(
  env: Env,
  store: StoreRow,
  body: unknown,
): Promise<MockupTask> {
  const res = await fetch(`${API}/v2/mockup-tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${store.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Printful ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.data ?? json) as MockupTask;
}

export function catalogPath(params: URLSearchParams): string {
  const q = new URLSearchParams();
  q.set("limit", params.get("limit") ?? "20");
  q.set("offset", params.get("offset") ?? "0");

  // The docs claim it defaults to "worldwide", but the API answers
  // "Selling region not found" unless it travels explicitly. Always send it.
  const region = params.get("selling_region_name") ?? "worldwide";
  if (!(SELLING_REGIONS as readonly string[]).includes(region)) {
    throw new Error(`Invalid region: ${region}. Valid: ${SELLING_REGIONS.join(", ")}`);
  }
  q.set("selling_region_name", region);

  for (const k of ["category_ids", "colors", "techniques", "sort_type", "sort_direction", "new"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  return `/v2/catalog-products?${q}`;
}
