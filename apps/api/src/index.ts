export interface Env {
  DB: D1Database;
  /** Product photos, asset uploads, quick-design thumbs and generated print files. */
  BUCKET: R2Bucket;
  /** Allowed origins, comma separated. Credentials require an explicit origin, not *. */
  ALLOWED_ORIGINS?: string;
  /** Printful app credentials. Live in secrets, never in code. */
  PRINTFUL_CLIENT_ID: string;
  PRINTFUL_CLIENT_SECRET: string;
  PRINTFUL_REDIRECT_URI?: string;
  ADMIN_URL?: string;
  /** SHA-256 hex of the admin passphrase. */
  ADMIN_PASSPHRASE_HASH: string;
  /** HMAC key for the session cookie. */
  SESSION_SIGNING_KEY: string;
}

import {
  authorizeUrl,
  call,
  catalogPath,
  createMockupTask,
  exchangeCode,
  type MockupTask,
  type PrintFileStyle,
  type StoreRow,
} from "./printful";
import { importProduct, type Placement, type Variant } from "./import";
import { isAuthed, login, logout, session } from "./auth";

const REGION = "north_america";

function cors(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ??
    "http://localhost:5173,http://localhost:5174").split(",").map((s) => s.trim());
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,PUT,PATCH,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function json(data: unknown, init: ResponseInit = {}, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...extra, ...(init.headers ?? {}) },
  });
}

async function currentStore(env: Env): Promise<StoreRow | null> {
  return env.DB.prepare(
    "SELECT * FROM stores WHERE provider = 'printful' ORDER BY updated_at DESC LIMIT 1",
  ).first<StoreRow>();
}

// ---- Row mappers (spec schema) -------------------------------------------------

interface ProductRow {
  id: string; slug: string; name: string; status: string; source: string;
  external_product_id: string; external_variant_id: string | null; photo_key: string | null;
  retail_price_cents: number; currency: string; placements: string;
  variant_templates: string | null; variants: string; techniques: string | null;
  offered_variant_colors: string | null; mockups: string | null;
}

function rowToProduct(r: ProductRow) {
  return {
    id: r.id, slug: r.slug, name: r.name, status: r.status, source: r.source,
    externalProductId: r.external_product_id, externalVariantId: r.external_variant_id,
    hasPhoto: !!r.photo_key,
    retailPriceCents: r.retail_price_cents, currency: r.currency,
    placements: JSON.parse(r.placements) as Placement[],
    variantTemplates: r.variant_templates ? JSON.parse(r.variant_templates) : null,
    variants: JSON.parse(r.variants) as Variant[],
    techniques: r.techniques ? JSON.parse(r.techniques) : [],
    offeredVariantColors: r.offered_variant_colors ? JSON.parse(r.offered_variant_colors) as string[] : null,
    mockups: r.mockups ? JSON.parse(r.mockups) as { generated: string[]; featured: string[] } : null,
  };
}

interface DesignRow {
  id: string; product_id: string; name: string; status: string; elements: string;
}
function rowToDesign(r: DesignRow) {
  return {
    id: r.id, productId: r.product_id, name: r.name, status: r.status,
    elements: JSON.parse(r.elements),
  };
}

// ---- Printful (admin) ----------------------------------------------------------

async function printfulRoutes(
  path: string, req: Request, env: Env, headers: HeadersInit,
): Promise<Response> {
  const url = new URL(req.url);

  if (path === "/api/printful/status") {
    const store = await currentStore(env);
    return json(
      { connected: !!store, storeName: store?.name ?? null, storeId: store?.external_id ?? null },
      {}, headers,
    );
  }

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
    const row = await env.DB.prepare("SELECT state FROM oauth_states WHERE state = ?")
      .bind(state).first();
    if (!row) return back("printful=error&msg=invalid+state");
    await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
    try {
      const tok = await exchangeCode(env, code);
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO stores (id, provider, external_id, name, access_token, refresh_token,
                             expires_at, created_at, updated_at)
         VALUES ('printful','printful',NULL,NULL,?1,?2,?3,?4,?4)
         ON CONFLICT(id) DO UPDATE SET
           access_token=?1, refresh_token=?2, expires_at=?3, updated_at=?4`,
      ).bind(
        tok.access_token, tok.refresh_token ?? null,
        tok.expires_in ? now + tok.expires_in * 1000 : null, now,
      ).run();
      return back("printful=connected");
    } catch (e) {
      return back(`printful=error&msg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 120))}`);
    }
  }

  const store = await currentStore(env);
  if (!store) return json({ error: "Printful is not connected" }, { status: 409 }, headers);

  if (path === "/api/printful/categories") {
    return json(await call<unknown>(env, store, "/v2/catalog-categories?limit=100"), {}, headers);
  }
  if (path === "/api/printful/catalog") {
    const p = new URLSearchParams(url.searchParams);
    if (!p.get("selling_region_name")) p.set("selling_region_name", REGION);
    return json(await call<unknown>(env, store, catalogPath(p)), {}, headers);
  }

  const rq = `selling_region_name=${REGION}`;

  const prices = path.match(/^\/api\/printful\/catalog\/(\d+)\/prices$/);
  if (prices) {
    return json(await call<unknown>(env, store, `/v2/catalog-products/${prices[1]}/prices?${rq}`), {}, headers);
  }
  const vars = path.match(/^\/api\/printful\/catalog\/(\d+)\/variants$/);
  if (vars) {
    const off = url.searchParams.get("offset") ?? "0";
    return json(await call<unknown>(env, store,
      `/v2/catalog-products/${vars[1]}/catalog-variants?${rq}&limit=100&offset=${off}`), {}, headers);
  }
  const detail = path.match(/^\/api\/printful\/catalog\/(\d+)$/);
  if (detail) {
    const id = detail[1];
    const [product, styles, variants] = await Promise.all([
      call<unknown>(env, store, `/v2/catalog-products/${id}?${rq}`),
      call<unknown>(env, store, `/v2/catalog-products/${id}/mockup-styles?${rq}`).catch((e) => ({ error: String(e) })),
      call<unknown>(env, store, `/v2/catalog-products/${id}/catalog-variants?${rq}&limit=100`).catch((e) => ({ error: String(e) })),
    ]);
    return json({ product, styles, variants }, {}, headers);
  }

  if (path === "/api/printful/import" && req.method === "POST") {
    const { productId } = (await req.json()) as { productId: number };
    if (!productId) return json({ error: "productId is required" }, { status: 400 }, headers);
    const result = await importProduct(env, store, productId, REGION);
    return json(result, {}, headers);
  }

  return json({ error: "printful route not found" }, { status: 404 }, headers);
}

// ---- Mockup (multi-placement) --------------------------------------------------

async function renderMockup(
  env: Env, store: StoreRow,
  body: { productId: string; files: Array<{ placement: string; printFileUrl: string }> },
  headers: HeadersInit,
): Promise<Response> {
  const rq = `selling_region_name=${REGION}`;
  const row = await env.DB.prepare(
    "SELECT external_product_id, external_variant_id FROM products WHERE id = ?",
  ).bind(body.productId).first<{ external_product_id: string; external_variant_id: string | null }>();
  if (!row?.external_product_id) {
    return json({ error: "Unknown product" }, { status: 404 }, headers);
  }
  const catalogId = Number(row.external_product_id);
  const variantId = Number(row.external_variant_id ?? 0);

  const styles = await call<{ data?: PrintFileStyle[] }>(
    env, store, `/v2/catalog-products/${catalogId}/mockup-styles?${rq}`,
  );
  const styleList = styles.data ?? [];
  const styleIds = [...new Set(
    body.files.map((f) => styleList.find((s) => s.placement === f.placement)?.mockup_styles?.[0]?.id)
      .filter((x): x is number => !!x),
  )];
  const techniqueOf = (placement: string) =>
    styleList.find((s) => s.placement === placement)?.technique ?? "dtg";

  if (!variantId || styleIds.length === 0) {
    return json({ error: "Missing a mockup style or variant" }, { status: 422 }, headers);
  }

  const task = await createMockupTask(env, store, {
    format: "jpg",
    products: [{
      source: "catalog",
      mockup_style_ids: styleIds,
      catalog_product_id: catalogId,
      catalog_variant_ids: [variantId],
      placements: body.files.map((f) => ({
        placement: f.placement,
        technique: techniqueOf(f.placement),
        layers: [{ type: "file", url: f.printFileUrl }],
      })),
    }],
  });

  const id = Array.isArray(task) ? task[0].id : task.id;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await call<{ data?: MockupTask[] | MockupTask }>(env, store, `/v2/mockup-tasks?id=${id}`);
    const raw = res.data ?? res;
    const t = (Array.isArray(raw) ? raw[0] : raw) as MockupTask;
    if (t.status === "failed") {
      return json({ error: t.failure_reasons?.join("; ") ?? "Printful failed" }, { status: 422 }, headers);
    }
    if (t.status === "completed") {
      const urls = (t.catalog_variant_mockups ?? []).flatMap((v) => v.mockups.map((m) => m.mockup_url));
      return json(urls, {}, headers);
    }
  }
  return json({ error: "Printful took too long" }, { status: 504 }, headers);
}

// ---- Helpers -------------------------------------------------------------------

interface UploadFile { name: string; type: string; arrayBuffer(): Promise<ArrayBuffer> }
/** Narrow a FormData entry to an uploaded file without relying on the File global. */
function asUpload(entry: unknown): UploadFile | null {
  if (!entry || typeof entry === "string") return null;
  const f = entry as UploadFile;
  return typeof f.arrayBuffer === "function" ? f : null;
}

/** Aspect (w/h) of an image from its bytes, no DOM. Handles PNG, JPEG, SVG. */
async function imageAspect(buf: ArrayBuffer, type: string): Promise<number> {
  const b = new Uint8Array(buf);
  if (type.includes("svg") || (b[0] === 0x3c)) {
    const text = new TextDecoder().decode(b.slice(0, 2000));
    const vb = text.match(/viewBox="[\d.\s]*?([\d.]+)[\s,]+([\d.]+)"/);
    if (vb) return Number(vb[1]) / Number(vb[2]);
    const w = text.match(/width="([\d.]+)/), h = text.match(/height="([\d.]+)/);
    if (w && h) return Number(w[1]) / Number(h[1]);
    return 1;
  }
  // PNG: IHDR width/height at bytes 16..24, big-endian.
  if (b[0] === 0x89 && b[1] === 0x50) {
    const dv = new DataView(buf);
    return dv.getUint32(16) / dv.getUint32(20);
  }
  // JPEG: scan SOF markers for dimensions.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        return w / h;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return 1;
}

interface OrderItemIn {
  productId: string; designId: string; variantId: string; variantLabel: string;
  slotValues: Record<string, string>; qty: number;
}

async function createOrder(env: Env, body: {
  email: string; notify?: boolean; shipping: unknown; items: OrderItemIn[];
}, headers: HeadersInit): Promise<Response> {
  if (!body.email || !body.items?.length) {
    return json({ error: "email and at least one item are required" }, { status: 400 }, headers);
  }
  const now = Date.now();
  const orderId = crypto.randomUUID();
  const reference = `ABB-${orderId.slice(0, 5).toUpperCase()}`;

  let subtotal = 0;
  const items: Array<[string, number]> = [];
  for (const it of body.items) {
    const p = await env.DB.prepare("SELECT retail_price_cents FROM products WHERE id = ?")
      .bind(it.productId).first<{ retail_price_cents: number }>();
    const unit = p?.retail_price_cents ?? 0;
    subtotal += unit * (it.qty || 1);
    items.push([it.productId, unit]);
  }

  await env.DB.prepare(
    `INSERT INTO orders (id, reference, status, email, notify, shipping, subtotal_cents, currency, created_at, updated_at)
     VALUES (?1,?2,'draft',?3,?4,?5,?6,'USD',?7,?7)`,
  ).bind(orderId, reference, body.email, body.notify === false ? 0 : 1, JSON.stringify(body.shipping), subtotal, now).run();

  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    await env.DB.prepare(
      `INSERT INTO order_items (id, order_id, product_id, design_id, variant_id, variant_label, slot_values, qty, unit_price_cents, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
    ).bind(crypto.randomUUID(), orderId, it.productId, it.designId, it.variantId, it.variantLabel, JSON.stringify(it.slotValues ?? {}), it.qty || 1, items[i][1], now).run();
  }

  return json({ id: orderId, reference, status: "draft" }, {}, headers);
}

// ---- Router --------------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin");
    const headers = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const authed = () => isAuthed(req, env);

    try {
      if (path === "/api/health") return json({ ok: true }, {}, headers);

      // Admin auth
      if (path === "/api/admin/login" && req.method === "POST") return login(req, env, headers);
      if (path === "/api/admin/logout" && req.method === "POST") return logout(headers);
      if (path === "/api/admin/session") return session(req, env, headers);

      // Printful (all admin-gated except the OAuth callback, which Printful calls)
      if (path.startsWith("/api/printful")) {
        if (path !== "/api/printful/callback" && !(await authed())) {
          return json({ error: "Unauthorized" }, { status: 401 }, headers);
        }
        return printfulRoutes(path, req, env, headers);
      }

      // Product photo (public, from R2)
      const photo = path.match(/^\/api\/products\/([\w-]+)\/photo$/);
      if (photo && req.method === "GET") {
        const row = await env.DB.prepare("SELECT photo_key FROM products WHERE id = ?")
          .bind(photo[1]).first<{ photo_key: string | null }>();
        if (!row?.photo_key) return json({ error: "not found" }, { status: 404 }, headers);
        const obj = await env.BUCKET.get(row.photo_key);
        if (!obj) return json({ error: "photo missing" }, { status: 404 }, headers);
        return new Response(obj.body, {
          headers: { ...headers, "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=3600" },
        });
      }

      // Print files (public GET so Printful can fetch; PUT open to storefront + admin)
      const pf = path.match(/^\/api\/print-files\/([\w.-]+)$/);
      if (pf && req.method === "PUT") {
        await env.BUCKET.put(`print-files/${pf[1]}.png`, await req.arrayBuffer(), {
          httpMetadata: { contentType: "image/png" },
        });
        return json({ url: `${url.origin}/api/print-files/${pf[1]}` }, {}, headers);
      }
      if (pf && req.method === "GET") {
        const obj = await env.BUCKET.get(`print-files/${pf[1]}.png`);
        if (!obj) return json({ error: "not found" }, { status: 404 }, headers);
        return new Response(obj.body, { headers: { ...headers, "Content-Type": "image/png" } });
      }

      // Uploads & assets bytes (public GET)
      const upl = path.match(/^\/api\/uploads\/([\w.-]+)$/);
      if (upl && req.method === "GET") {
        const obj = await env.BUCKET.get(`uploads/${upl[1]}`);
        if (!obj) return json({ error: "not found" }, { status: 404 }, headers);
        return new Response(obj.body, { headers: { ...headers, "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream" } });
      }
      const assetFile = path.match(/^\/api\/assets\/([\w-]+)\/file$/);
      if (assetFile && req.method === "GET") {
        const row = await env.DB.prepare("SELECT storage_key FROM assets WHERE id = ?")
          .bind(assetFile[1]).first<{ storage_key: string }>();
        if (!row) return json({ error: "not found" }, { status: 404 }, headers);
        const obj = await env.BUCKET.get(row.storage_key);
        if (!obj) return json({ error: "not found" }, { status: 404 }, headers);
        return new Response(obj.body, { headers: { ...headers, "Content-Type": obj.httpMetadata?.contentType ?? "image/svg+xml" } });
      }

      // Uploads (admin): authoring artwork into R2.
      if (path === "/api/uploads" && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const form = await req.formData();
        const file = asUpload(form.get("file"));
        if (!file) return json({ error: "file required" }, { status: 400 }, headers);
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
        const uploadId = `${crypto.randomUUID().slice(0, 12)}.${ext}`;
        const buf = await file.arrayBuffer();
        await env.BUCKET.put(`uploads/${uploadId}`, buf, { httpMetadata: { contentType: file.type || "image/png" } });
        const aspect = await imageAspect(buf, file.type).catch(() => 1);
        return json({ uploadId, url: `${url.origin}/api/uploads/${uploadId}`, aspect }, {}, headers);
      }

      // Assets library (admin manage; public read handled above)
      if (path === "/api/assets" && req.method === "GET") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const col = url.searchParams.get("collection");
        const q = col
          ? env.DB.prepare("SELECT * FROM assets WHERE collection = ? ORDER BY created_at DESC").bind(col)
          : env.DB.prepare("SELECT * FROM assets ORDER BY created_at DESC");
        const { results } = await q.all<{ id: string; name: string; collection: string | null; kind: string; aspect: number; recolor_parts: string | null }>();
        return json(results.map((a) => ({ id: a.id, name: a.name, collection: a.collection, kind: a.kind, aspect: a.aspect, recolorParts: a.recolor_parts ? JSON.parse(a.recolor_parts) : [] })), {}, headers);
      }
      if (path === "/api/assets" && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const form = await req.formData();
        const file = asUpload(form.get("file"));
        if (!file) return json({ error: "file required" }, { status: 400 }, headers);
        const kind = file.name.endsWith(".svg") ? "svg" : "png";
        const id = crypto.randomUUID().slice(0, 12);
        const key = `assets/${id}.${kind}`;
        const buf = await file.arrayBuffer();
        await env.BUCKET.put(key, buf, { httpMetadata: { contentType: kind === "svg" ? "image/svg+xml" : "image/png" } });
        const recolorParts = kind === "svg"
          ? [...new Set([...new TextDecoder().decode(buf).matchAll(/data-recolor="([^"]+)"/g)].map((m) => m[1]))]
          : [];
        const aspect = await imageAspect(buf, file.type).catch(() => 1);
        const now = Date.now();
        await env.DB.prepare(
          "INSERT INTO assets (id, name, collection, storage_key, kind, aspect, recolor_parts, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        ).bind(id, String(form.get("name") ?? file.name), (form.get("collection") as string) ?? null, key, kind, aspect, JSON.stringify(recolorParts), now).run();
        return json({ id, name: String(form.get("name") ?? file.name), kind, aspect, recolorParts }, {}, headers);
      }

      // Quick designs (admin): premade element combos
      if (path === "/api/quick-designs" && req.method === "GET") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const { results } = await env.DB.prepare("SELECT * FROM quick_designs ORDER BY created_at DESC")
          .all<{ id: string; name: string; thumb_key: string | null; elements: string }>();
        return json(results.map((r) => ({ id: r.id, name: r.name, elements: JSON.parse(r.elements) })), {}, headers);
      }
      if (path === "/api/quick-designs" && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const body = (await req.json()) as { name: string; elements: unknown };
        const id = crypto.randomUUID().slice(0, 12);
        await env.DB.prepare("INSERT INTO quick_designs (id, name, thumb_key, elements, created_at) VALUES (?1,?2,NULL,?3,?4)")
          .bind(id, body.name || "Quick design", JSON.stringify(body.elements ?? []), Date.now()).run();
        return json({ id, name: body.name, elements: body.elements }, {}, headers);
      }

      // Orders (public create; owner list)
      if (path === "/api/orders" && req.method === "POST") {
        return createOrder(env, await req.json(), headers);
      }
      const orderRef = path.match(/^\/api\/orders\/([\w-]+)$/);
      if (orderRef && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM orders WHERE reference = ?").bind(orderRef[1])
          .first<{ id: string; reference: string; status: string; email: string; subtotal_cents: number; currency: string }>();
        if (!row) return json({ error: "not found" }, { status: 404 }, headers);
        return json({ id: row.id, reference: row.reference, status: row.status, email: row.email, subtotalCents: row.subtotal_cents, currency: row.currency }, {}, headers);
      }

      // Mockup (public, rate-limited in spirit)
      if (path === "/api/mockup" && req.method === "POST") {
        const store = await currentStore(env);
        if (!store) return json({ error: "Printful is not connected" }, { status: 409 }, headers);
        return renderMockup(env, store, await req.json(), headers);
      }

      // Products
      if (path === "/api/products" && req.method === "GET") {
        const showAll = await authed();
        const q = showAll
          ? env.DB.prepare("SELECT * FROM products ORDER BY updated_at DESC")
          : env.DB.prepare("SELECT * FROM products WHERE status = 'published' ORDER BY updated_at DESC");
        const { results } = await q.all<ProductRow>();
        return json(results.map(rowToProduct), {}, headers);
      }
      const bySlug = path.match(/^\/api\/products\/slug\/([\w-]+)$/);
      if (bySlug && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM products WHERE slug = ?")
          .bind(bySlug[1]).first<ProductRow>();
        if (!row || (row.status !== "published" && !(await authed()))) {
          return json({ error: "not found" }, { status: 404 }, headers);
        }
        return json(rowToProduct(row), {}, headers);
      }
      const prodId = path.match(/^\/api\/products\/([\w-]+)$/);
      if (prodId && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?")
          .bind(prodId[1]).first<ProductRow>();
        if (!row || (row.status !== "published" && !(await authed()))) {
          return json({ error: "not found" }, { status: 404 }, headers);
        }
        return json(rowToProduct(row), {}, headers);
      }
      if (prodId && req.method === "PATCH") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const body = (await req.json()) as {
          name?: string; retailPriceCents?: number; status?: string;
          offeredVariantColors?: string[] | null;
          mockups?: { generated: string[]; featured: string[] } | null;
        };
        const cur = await env.DB.prepare("SELECT * FROM products WHERE id = ?")
          .bind(prodId[1]).first<ProductRow>();
        if (!cur) return json({ error: "not found" }, { status: 404 }, headers);
        const offered = body.offeredVariantColors !== undefined
          ? (body.offeredVariantColors ? JSON.stringify(body.offeredVariantColors) : null)
          : cur.offered_variant_colors;
        const mockups = body.mockups !== undefined
          ? (body.mockups ? JSON.stringify(body.mockups) : null)
          : cur.mockups;
        await env.DB.prepare(
          "UPDATE products SET name=?1, retail_price_cents=?2, status=?3, offered_variant_colors=?4, mockups=?5, updated_at=?6 WHERE id=?7",
        ).bind(
          body.name ?? cur.name,
          body.retailPriceCents ?? cur.retail_price_cents,
          body.status ?? cur.status,
          offered, mockups,
          Date.now(), prodId[1],
        ).run();
        // Keep the design's status mirrored to the product's.
        if (body.status) {
          await env.DB.prepare("UPDATE designs SET status=?1, updated_at=?2 WHERE product_id=?3")
            .bind(body.status, Date.now(), prodId[1]).run();
        }
        const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId[1]).first<ProductRow>();
        return json(rowToProduct(row!), {}, headers);
      }

      // Designs
      const designByProduct = path.match(/^\/api\/designs\/product\/([\w-]+)$/);
      if (designByProduct && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM designs WHERE product_id = ?")
          .bind(designByProduct[1]).first<DesignRow>();
        if (!row || (row.status !== "published" && !(await authed()))) {
          return json({ error: "not found" }, { status: 404 }, headers);
        }
        return json(rowToDesign(row), {}, headers);
      }
      const designId = path.match(/^\/api\/designs\/([\w-]+)$/);
      if (designId && req.method === "PUT") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const body = (await req.json()) as { productId: string; name: string; status: string; elements: unknown };
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO designs (id, product_id, name, status, elements, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?6)
           ON CONFLICT(id) DO UPDATE SET name=?3, status=?4, elements=?5, updated_at=?6`,
        ).bind(designId[1], body.productId, body.name, body.status ?? "draft", JSON.stringify(body.elements ?? []), now).run();
        const row = await env.DB.prepare("SELECT * FROM designs WHERE id = ?").bind(designId[1]).first<DesignRow>();
        return json(rowToDesign(row!), {}, headers);
      }

      return json({ error: "route not found" }, { status: 404 }, headers);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }, headers);
    }
  },
};
