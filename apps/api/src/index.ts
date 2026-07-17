export interface Env {
  DB: D1Database;
  /** Product photos, asset uploads and generated print files. */
  BUCKET: R2Bucket;
  /** Allowed origins, comma separated. */
  ALLOWED_ORIGINS?: string;
  /** Printful app credentials. They live in .dev.vars, never in the code. */
  PRINTFUL_CLIENT_ID: string;
  PRINTFUL_CLIENT_SECRET: string;
  PRINTFUL_REDIRECT_URI?: string;
  /** Where the admin returns to after connecting. */
  ADMIN_URL?: string;
}

import {
  authorizeUrl,
  call,
  catalogPath,
  createMockupTask,
  defaultWrapDegrees,
  exchangeCode,
  type MockupTask,
  type PrintFileStyle,
  type StoreRow,
} from "./printful";

type Json = Record<string, unknown>;

function cors(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET,PUT,PATCH,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, init: ResponseInit = {}, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...extra, ...(init.headers ?? {}) },
  });
}

async function currentStore(env: Env): Promise<StoreRow | null> {
  return await env.DB.prepare(
    "SELECT * FROM stores WHERE provider = 'printful' ORDER BY updated_at DESC LIMIT 1",
  ).first<StoreRow>();
}

/**
 * Printful routes. The token never leaves here: the admin asks for the catalog and
 * the Worker answers already authenticated.
 */
async function printfulRoutes(
  path: string,
  req: Request,
  env: Env,
  headers: HeadersInit,
): Promise<Response> {
  const url = new URL(req.url);

  if (path === "/api/printful/status") {
    const store = await currentStore(env);
    return json(
      { connected: !!store, storeName: store?.name ?? null, storeId: store?.external_id ?? null },
      {},
      headers,
    );
  }

  // Starts the handshake. The state is stored so it can be verified on return.
  if (path === "/api/printful/connect") {
    const state = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)")
      .bind(state, Date.now()).run();
    return Response.redirect(authorizeUrl(env, state), 302);
  }

  if (path === "/api/printful/callback") {
    const admin = env.ADMIN_URL ?? "http://localhost:5174";
    const back = (params: string) => Response.redirect(`${admin}/?${params}`, 302);

    if (url.searchParams.get("success") === "0") return back("printful=rejected");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("printful=error&msg=missing+parameters");

    // Without verifying the state, the callback would accept any code sent to it.
    const row = await env.DB.prepare("SELECT state FROM oauth_states WHERE state = ?")
      .bind(state).first();
    if (!row) return back("printful=error&msg=invalid+state");
    await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

    try {
      const tok = await exchangeCode(env, code);
      const now = Date.now();
      const store = { id: "printful", name: null as string | null, external: null as string | null };
      await env.DB.prepare(
        `INSERT INTO stores (id, provider, external_id, name, access_token, refresh_token,
                             expires_at, created_at, updated_at)
         VALUES (?1,'printful',?2,?3,?4,?5,?6,?7,?7)
         ON CONFLICT(id) DO UPDATE SET
           access_token = ?4, refresh_token = ?5, expires_at = ?6, updated_at = ?7`,
      ).bind(
        store.id,
        store.external,
        store.name,
        tok.access_token,
        tok.refresh_token ?? null,
        tok.expires_in ? now + tok.expires_in * 1000 : null,
        now,
      ).run();
      return back("printful=connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return back(`printful=error&msg=${encodeURIComponent(msg.slice(0, 120))}`);
    }
  }

  const store = await currentStore(env);
  if (!store) return json({ error: "Printful is not connected" }, { status: 409 }, headers);

  if (path === "/api/printful/categories") {
    // Without limit it returns only 20 and the tree comes back truncated.
    const data = await call<unknown>(env, store, "/v2/catalog-categories?limit=100");
    return json(data, {}, headers);
  }

  if (path === "/api/printful/catalog") {
    const data = await call<unknown>(env, store, catalogPath(url.searchParams));
    return json(data, {}, headers);
  }

  // The whole v2 catalog requires the region, not just the listing.
  const region = url.searchParams.get("selling_region_name") ?? "worldwide";
  const rq = `selling_region_name=${encodeURIComponent(region)}`;

  // Prices are separate: the listing does not carry them and asking for all 498 would
  // be unworkable. Only what the admin is looking at gets fetched.
  const prices = path.match(/^\/api\/printful\/catalog\/(\d+)\/prices$/);
  if (prices) {
    const data = await call<unknown>(env, store, `/v2/catalog-products/${prices[1]}/prices?${rq}`);
    return json(data, {}, headers);
  }

  // Paged variants: some products have 200+, past Printful's 100 per page cap.
  const vars = path.match(/^\/api\/printful\/catalog\/(\d+)\/variants$/);
  if (vars) {
    const off = url.searchParams.get("offset") ?? "0";
    const data = await call<unknown>(
      env,
      store,
      `/v2/catalog-products/${vars[1]}/catalog-variants?${rq}&limit=100&offset=${off}`,
    );
    return json(data, {}, headers);
  }

  const detail = path.match(/^\/api\/printful\/catalog\/(\d+)$/);
  if (detail) {
    const id = detail[1];
    // mockup-styles carries print_area_width/height: the template measurements, which
    // is exactly what is hardcoded today.
    const [product, styles, variants] = await Promise.all([
      call<unknown>(env, store, `/v2/catalog-products/${id}?${rq}`),
      call<unknown>(env, store, `/v2/catalog-products/${id}/mockup-styles?${rq}`).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      })),
      // 100 is Printful's max. Products with more variants are paged by the client.
      call<unknown>(env, store, `/v2/catalog-products/${id}/catalog-variants?${rq}&limit=100`).catch(
        (e) => ({ error: e instanceof Error ? e.message : String(e) }),
      ),
    ]);
    return json({ product, styles, variants }, {}, headers);
  }

  if (path === "/api/printful/mockup" && req.method === "POST") {
    const body = (await req.json()) as { productId: string; printFileUrl: string };
    return await renderMockup(env, store, body, rq, headers);
  }

  if (path === "/api/printful/import" && req.method === "POST") {
    const body = (await req.json()) as {
      productId: number;
      variantId?: number;
      photoUrl: string;
      name?: string;
    };
    return await importProduct(env, store, body, rq, headers);
  }

  return json({ error: "printful route not found" }, { status: 404 }, headers);
}

/**
 * Renders the design on the real product and waits for it.
 *
 * Polling happens here rather than in the browser: it keeps the Printful task id out
 * of the client and turns an async job into one request. Measured at ~10s.
 */
async function renderMockup(
  env: Env,
  store: StoreRow,
  body: { productId: string; printFileUrl: string },
  rq: string,
  headers: HeadersInit,
): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT external_product_id, external_variant_id FROM products WHERE id = ?",
  ).bind(body.productId).first<{ external_product_id: string | null; external_variant_id: string | null }>();
  if (!row?.external_product_id) {
    return json({ error: "That product did not come from Printful" }, { status: 400 }, headers);
  }

  const catalogId = Number(row.external_product_id);
  const styles = await call<{ data?: PrintFileStyle[] }>(
    env, store, `/v2/catalog-products/${catalogId}/mockup-styles?${rq}`,
  );
  const printFile = (styles.data ?? []).find((s) => s.placement === "default") ?? (styles.data ?? [])[0];
  if (!printFile) {
    return json({ error: "Printful gave no mockup styles" }, { status: 422 }, headers);
  }
  // The first style is the front view: the one worth looking at while designing.
  const styleId = printFile.mockup_styles?.[0]?.id;
  const variantId = Number(row.external_variant_id ?? 0);
  if (!styleId || !variantId) {
    return json({ error: "Missing a mockup style or variant" }, { status: 422 }, headers);
  }

  const task = await createMockupTask(env, store, {
    format: "jpg",
    products: [{
      source: "catalog",
      mockup_style_ids: [styleId],
      catalog_product_id: catalogId,
      catalog_variant_ids: [variantId],
      placements: [{
        placement: printFile.placement,
        technique: printFile.technique,
        layers: [{ type: "file", url: body.printFileUrl }],
      }],
    }],
  });

  const id = Array.isArray(task) ? task[0].id : task.id;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await call<{ data?: MockupTask[] | MockupTask }>(
      env, store, `/v2/mockup-tasks?id=${id}`,
    );
    const raw = res.data ?? res;
    const t = (Array.isArray(raw) ? raw[0] : raw) as MockupTask;
    if (t.status === "failed") {
      return json({ error: t.failure_reasons?.join("; ") ?? "Printful failed" }, { status: 422 }, headers);
    }
    if (t.status === "completed") {
      const urls = (t.catalog_variant_mockups ?? []).flatMap((v) =>
        v.mockups.map((m) => m.mockup_url),
      );
      return json(urls, {}, headers);
    }
  }
  return json({ error: "Printful took too long" }, { status: 504 }, headers);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Imports a catalog product: photo into R2, measurements into D1.
 *
 * The photo is passed in by the admin rather than picked here. The engine needs the
 * product front-on against a flat background to extract R(y), and Printful's catalog
 * images include angles, props and lifestyle shots. Choosing one automatically would
 * import products whose preview silently cannot work.
 */
async function importProduct(
  env: Env,
  store: StoreRow,
  body: { productId: number; variantId?: number; photoUrl: string; name?: string },
  rq: string,
  headers: HeadersInit,
): Promise<Response> {
  const { productId, variantId, photoUrl } = body;
  if (!photoUrl) return json({ error: "photoUrl is required" }, { status: 400 }, headers);

  const [prodRes, stylesRes] = await Promise.all([
    call<{ data?: { name: string; type: string } }>(env, store, `/v2/catalog-products/${productId}?${rq}`),
    call<{ data?: PrintFileStyle[] }>(env, store, `/v2/catalog-products/${productId}/mockup-styles?${rq}`),
  ]);
  const product = prodRes.data ?? (prodRes as unknown as { name: string; type: string });
  const styles = stylesRes.data ?? [];
  const printFile = styles.find((s) => s.placement === "default") ?? styles[0];
  if (!printFile) {
    return json({ error: "Printful gave no print file measurements" }, { status: 422 }, headers);
  }

  const photo = await fetch(photoUrl);
  if (!photo.ok) {
    return json({ error: `Could not fetch the photo (${photo.status})` }, { status: 422 }, headers);
  }
  const id = `printful-${productId}${variantId ? `-${variantId}` : ""}`;
  const photoKey = `products/${id}/photo`;
  await env.BUCKET.put(photoKey, await photo.arrayBuffer(), {
    httpMetadata: { contentType: photo.headers.get("Content-Type") ?? "image/jpeg" },
  });

  const spec = {
    widthPx: Math.round(printFile.print_area_width * printFile.dpi),
    heightPx: Math.round(printFile.print_area_height * printFile.dpi),
    dpi: printFile.dpi,
    wrapDegrees: defaultWrapDegrees(printFile.technique),
    bleedPx: 0,
  };
  const surface = spec.wrapDegrees === null ? "flat" : "revolution";
  const name = body.name ?? product.name;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO products
       (id, name, slug, status, source, external_product_id, external_variant_id,
        photo_key, surface, print_band, calibration, print_spec, store_id,
        created_at, updated_at)
     VALUES (?1,?2,?3,'draft','printful',?4,?5,?6,?7,NULL,?8,?9,?10,?11,?11)
     ON CONFLICT(id) DO UPDATE SET
       name = ?2, photo_key = ?6, surface = ?7, print_spec = ?9, updated_at = ?11`,
  ).bind(
    id,
    name,
    slugify(`${name}-${productId}`),
    String(productId),
    variantId ? String(variantId) : null,
    photoKey,
    surface,
    JSON.stringify({ shadingStrength: 1, safeAngleDeg: 45 }),
    JSON.stringify(spec),
    store.id,
    now,
  ).run();

  return json({ id, name, photoKey, printSpec: spec, surface, technique: printFile.technique }, {}, headers);
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  source: string;
  external_product_id: string | null;
  external_variant_id: string | null;
  photo_key: string | null;
  surface: string;
  print_band: string | null;
  calibration: string | null;
  print_spec: string;
}

function rowToProduct(r: ProductRow) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    source: r.source,
    externalProductId: r.external_product_id,
    externalVariantId: r.external_variant_id,
    surface: r.surface,
    hasPhoto: !!r.photo_key,
    printBand: r.print_band ? JSON.parse(r.print_band) : null,
    calibration: r.calibration ? JSON.parse(r.calibration) : null,
    printSpec: JSON.parse(r.print_spec),
  };
}

interface DesignRow {
  id: string;
  product_id: string;
  name: string;
  slug: string;
  price_cents: number;
  status: string;
  base_image_key: string | null;
  elements: string;
}

function rowToDesign(r: DesignRow) {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.name,
    slug: r.slug,
    priceCents: r.price_cents,
    status: r.status,
    baseImageKey: r.base_image_key,
    elements: JSON.parse(r.elements),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin");
    const headers = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");

    try {
      if (path.startsWith("/api/printful")) {
        return await printfulRoutes(path, req, env, headers);
      }

      // Photos are served from R2 so the browser never needs a Printful URL, and the
      // engine can read pixels without cross-origin trouble.
      const photo = path.match(/^\/api\/products\/([\w-]+)\/photo$/);
      if (photo && req.method === "GET") {
        const row = await env.DB.prepare("SELECT photo_key FROM products WHERE id = ?")
          .bind(photo[1]).first<{ photo_key: string | null }>();
        if (!row?.photo_key) return json({ error: "not found" }, { status: 404 }, headers);
        const obj = await env.BUCKET.get(row.photo_key);
        if (!obj) return json({ error: "photo missing from R2" }, { status: 404 }, headers);
        return new Response(obj.body, {
          headers: {
            ...headers,
            "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      // The wrap cannot be derived from Printful's data (it gives the print width but
      // not the diameter), so the admin corrects it against the preview.
      const patch = path.match(/^\/api\/products\/([\w-]+)$/);
      if (patch && req.method === "PATCH") {
        const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?")
          .bind(patch[1]).first<ProductRow>();
        if (!row) return json({ error: "not found" }, { status: 404 }, headers);

        const body = (await req.json()) as { wrapDegrees?: number | null; safeAngleDeg?: number };
        const spec = JSON.parse(row.print_spec) as Record<string, unknown>;
        const cal = row.calibration
          ? (JSON.parse(row.calibration) as Record<string, unknown>)
          : { shadingStrength: 1, safeAngleDeg: 45 };

        if ("wrapDegrees" in body) {
          const w = body.wrapDegrees;
          if (w !== null && (typeof w !== "number" || w <= 0 || w > 360)) {
            return json({ error: "wrapDegrees must be null or 0-360" }, { status: 400 }, headers);
          }
          spec.wrapDegrees = w;
        }
        if (typeof body.safeAngleDeg === "number") cal.safeAngleDeg = body.safeAngleDeg;

        await env.DB.prepare(
          "UPDATE products SET print_spec = ?1, calibration = ?2, surface = ?3, updated_at = ?4 WHERE id = ?5",
        ).bind(
          JSON.stringify(spec),
          JSON.stringify(cal),
          spec.wrapDegrees === null ? "flat" : "revolution",
          Date.now(),
          patch[1],
        ).run();

        const updated = await env.DB.prepare("SELECT * FROM products WHERE id = ?")
          .bind(patch[1]).first<ProductRow>();
        return json(rowToProduct(updated!), {}, headers);
      }

      // Printful fetches the print file over HTTP, so it has to live somewhere public.
      // On localhost it is not, and the mockup fails until the API is deployed.
      const upload = path.match(/^\/api\/print-files\/([\w-]+)$/);
      if (upload && req.method === "PUT") {
        const key = `print-files/${upload[1]}.png`;
        await env.BUCKET.put(key, await req.arrayBuffer(), {
          httpMetadata: { contentType: "image/png" },
        });
        return json({ url: `${new URL(req.url).origin}/api/print-files/${upload[1]}` }, {}, headers);
      }
      if (upload && req.method === "GET") {
        const obj = await env.BUCKET.get(`print-files/${upload[1]}.png`);
        if (!obj) return json({ error: "not found" }, { status: 404 }, headers);
        return new Response(obj.body, {
          headers: { ...headers, "Content-Type": "image/png" },
        });
      }

      if (path === "/api/products" && req.method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM products ORDER BY updated_at DESC",
        ).all<ProductRow>();
        return json(results.map(rowToProduct), {}, headers);
      }

      if (path === "/api/designs" && req.method === "GET") {
        const status = url.searchParams.get("status");
        const q = status
          ? env.DB.prepare("SELECT * FROM designs WHERE status = ? ORDER BY updated_at DESC").bind(status)
          : env.DB.prepare("SELECT * FROM designs ORDER BY updated_at DESC");
        const { results } = await q.all<DesignRow>();
        return json(results.map(rowToDesign), {}, headers);
      }

      const match = path.match(/^\/api\/designs\/([\w-]+)$/);
      if (match) {
        const id = match[1];
        if (req.method === "GET") {
          const row = await env.DB.prepare("SELECT * FROM designs WHERE id = ?")
            .bind(id).first<DesignRow>();
          if (!row) return json({ error: "not found" }, { status: 404 }, headers);
          return json(rowToDesign(row), {}, headers);
        }
        if (req.method === "PUT") {
          const body = (await req.json()) as Json;
          const now = Date.now();
          const elements = JSON.stringify(body.elements ?? []);
          await env.DB.prepare(
            `INSERT INTO designs
               (id, product_id, name, slug, price_cents, status, base_image_key,
                elements, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
             ON CONFLICT(id) DO UPDATE SET
               name = ?3, slug = ?4, price_cents = ?5, status = ?6,
               base_image_key = ?7, elements = ?8, updated_at = ?9`,
          ).bind(
            id,
            String(body.productId ?? ""),
            String(body.name ?? "Untitled"),
            String(body.slug ?? id),
            Number(body.priceCents ?? 0),
            String(body.status ?? "borrador"),
            (body.baseImageKey as string) ?? null,
            elements,
            now,
          ).run();
          const row = await env.DB.prepare("SELECT * FROM designs WHERE id = ?")
            .bind(id).first<DesignRow>();
          return json(rowToDesign(row!), {}, headers);
        }
        if (req.method === "DELETE") {
          await env.DB.prepare("DELETE FROM designs WHERE id = ?").bind(id).run();
          return new Response(null, { status: 204, headers });
        }
      }

      return json({ error: "route not found" }, { status: 404 }, headers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, { status: 500 }, headers);
    }
  },
};
