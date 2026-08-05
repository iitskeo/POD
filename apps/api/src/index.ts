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
  /** PayPal (docs/pod/10). PAYPAL_ENV ('sandbox'|'live') selects which credential set is used,
   *  so both can live side by side. Unsuffixed names are an optional fallback. */
  PAYPAL_ENV?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_CLIENT_ID_SANDBOX?: string;
  PAYPAL_CLIENT_SECRET_SANDBOX?: string;
  PAYPAL_WEBHOOK_ID_SANDBOX?: string;
  PAYPAL_CLIENT_ID_LIVE?: string;
  PAYPAL_CLIENT_SECRET_LIVE?: string;
  PAYPAL_WEBHOOK_ID_LIVE?: string;
  /** Resend (owner sales notifications, docs/pod/10). Inert until both are set. */
  RESEND_API_KEY?: string;
  OWNER_EMAIL?: string;
}

import {
  authorizeUrl,
  call,
  callMethod,
  catalogPath,
  createMockupTask,
  exchangeCode,
  type MockupTask,
  type PrintFileStyle,
  type StoreRow,
} from "./printful";
import { importProduct, type Placement, type Variant } from "./import";
import { isAuthed, login, logout, session } from "./auth";
import { capturePaypalOrder, createPaypalOrder, paypalClientId, paypalConfigured, verifyWebhook } from "./paypal";
import { fulfillOrder, shippingRateCents } from "./fulfill";
import { notifyOwnerOfSale } from "./email";

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
  retail_price_cents: number; base_price_cents: number; currency: string; placements: string;
  variant_templates: string | null; variants: string; techniques: string | null;
  offered_variant_colors: string | null; mockups: string | null;
  description: string | null; materials: string | null;
}

function rowToProduct(r: ProductRow) {
  return {
    id: r.id, slug: r.slug, name: r.name, status: r.status, source: r.source,
    externalProductId: r.external_product_id, externalVariantId: r.external_variant_id,
    hasPhoto: !!r.photo_key,
    retailPriceCents: r.retail_price_cents, basePriceCents: r.base_price_cents ?? 0, currency: r.currency,
    description: r.description, materials: r.materials,
    placements: JSON.parse(r.placements) as Placement[],
    variantTemplates: r.variant_templates ? JSON.parse(r.variant_templates) : null,
    variants: JSON.parse(r.variants) as Variant[],
    techniques: r.techniques ? JSON.parse(r.techniques) : [],
    offeredVariantColors: r.offered_variant_colors ? JSON.parse(r.offered_variant_colors) as string[] : null,
    mockups: r.mockups ? JSON.parse(r.mockups) as { generated: string[]; featured: string[]; byColor?: Record<string, string> } : null,
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
  body: { productId: string; files: Array<{ placement: string; printFileUrl: string }>; variantIds?: number[] },
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
  // One task can render several colours at once (docs/pod/09 P2). Cap it so publish stays
  // reasonable and we don't hit Printful's rate limits.
  const variantIds = (body.variantIds?.length ? body.variantIds : [Number(row.external_variant_id ?? 0)])
    .filter((v) => v > 0)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 12);

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

  if (!variantIds.length) {
    return json({ error: "This product has no selected variant to mock up." }, { status: 422 }, headers);
  }
  if (styleIds.length === 0) {
    // All-over / cut-sew / knitting products often expose no mockup styles for their
    // placements. Fail fast with the reason instead of creating a task that never completes.
    const placements = [...new Set(body.files.map((f) => f.placement))].join(", ");
    const techniques = [...new Set(body.files.map((f) => techniqueOf(f.placement)))].join(", ");
    return json({
      error: `Printful has no mockup style for this product (placements: ${placements}; technique: ${techniques}). It can't be auto-mocked — publish without mockups.`,
    }, { status: 422 }, headers);
  }

  const task = await createMockupTask(env, store, {
    format: "jpg",
    products: [{
      source: "catalog",
      mockup_style_ids: styleIds,
      catalog_product_id: catalogId,
      catalog_variant_ids: variantIds,
      placements: body.files.map((f) => ({
        placement: f.placement,
        technique: techniqueOf(f.placement),
        layers: [{ type: "file", url: f.printFileUrl }],
      })),
    }],
  });

  // Async job: return the task id immediately; the client polls GET /api/mockup?task=id.
  // This keeps every request short so neither the Worker nor the browser fetch times out.
  const id = Array.isArray(task) ? task[0].id : task.id;
  return json({ taskId: id }, {}, headers);
}

/** Copy a Printful mockup into our R2 so the stored storefront URL never expires. Printful serves
 *  mockups from a temporary S3 URL (…/tmp/…) that eventually 403s; we self-host a stable copy. */
async function persistMockup(env: Env, origin: string, taskId: string, variantId: number, srcUrl: string): Promise<string> {
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`mockup fetch ${res.status}`);
  const key = `${taskId}-${variantId}-${crypto.randomUUID().slice(0, 8)}`;
  await env.BUCKET.put(`mockups/${key}.jpg`, await res.arrayBuffer(), {
    httpMetadata: { contentType: res.headers.get("content-type") ?? "image/jpeg" },
  });
  return `${origin}/api/mockups/${key}`;
}

/** One status check for a mockup task (the client polls this). On completion each Printful mockup
 *  is copied into R2 so the URL we hand the storefront stays valid forever. */
async function pollMockup(env: Env, store: StoreRow, taskId: string, origin: string, headers: HeadersInit): Promise<Response> {
  const res = await call<{ data?: MockupTask[] | MockupTask }>(env, store, `/v2/mockup-tasks?id=${taskId}`);
  const raw = res.data ?? res;
  const t = (Array.isArray(raw) ? raw[0] : raw) as MockupTask;
  if (t.status === "failed") {
    return json({ status: "failed", error: t.failure_reasons?.join("; ") ?? "Printful failed" }, {}, headers);
  }
  if (t.status === "completed") {
    const printful = (t.catalog_variant_mockups ?? []).flatMap((v) =>
      v.mockups.map((m) => ({ variantId: v.catalog_variant_id, url: m.mockup_url })));
    const mockups = await Promise.all(printful.map(async (m) => ({
      variantId: m.variantId,
      url: await persistMockup(env, origin, taskId, m.variantId, m.url).catch(() => m.url),
    })));
    return json({ status: "completed", mockups, urls: mockups.map((m) => m.url) }, {}, headers);
  }
  return json({ status: "pending" }, {}, headers);
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
  /** Print files rendered at checkout, keyed by placement — used to submit to Printful. */
  printFiles?: Record<string, string>;
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
      `INSERT INTO order_items (id, order_id, product_id, design_id, variant_id, variant_label, slot_values, qty, unit_price_cents, print_files, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
    ).bind(crypto.randomUUID(), orderId, it.productId, it.designId, it.variantId, it.variantLabel, JSON.stringify(it.slotValues ?? {}), it.qty || 1, items[i][1], it.printFiles ? JSON.stringify(it.printFiles) : null, now).run();
  }

  return json({ id: orderId, reference, status: "draft" }, {}, headers);
}

/** After an order is paid: notify the owner and submit it to Printful. Best-effort — a failure
 *  here never affects the buyer's paid confirmation; fulfilment failures are recorded for retry. */
async function onOrderPaid(env: Env, reference: string): Promise<void> {
  const order = await env.DB.prepare("SELECT id, email, shipping, subtotal_cents FROM orders WHERE reference = ?")
    .bind(reference).first<{ id: string; email: string; shipping: string; subtotal_cents: number }>();
  if (!order) return;
  const { results: items } = await env.DB.prepare(
    "SELECT oi.variant_label, oi.qty, p.name FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?",
  ).bind(order.id).all<{ variant_label: string; qty: number; name: string | null }>();

  await notifyOwnerOfSale(env, {
    reference, email: order.email, subtotalCents: order.subtotal_cents,
    items: items.map((i) => ({ name: i.name ?? "Item", variantLabel: i.variant_label, qty: i.qty })),
    shipping: JSON.parse(order.shipping || "{}"),
  });

  const store = await currentStore(env);
  if (store) {
    try {
      await fulfillOrder(env, store, order.id, env.PAYPAL_ENV === "live");
    } catch (e) {
      await env.DB.prepare("UPDATE orders SET fulfillment_status='failed', fulfillment_error=?1, updated_at=?2 WHERE id=?3")
        .bind(String(e instanceof Error ? e.message : e).slice(0, 300), Date.now(), order.id).run().catch(() => {});
    }
  }
}

// ---- Order history (admin) helpers ----------------------------------------------

interface OrderListRow {
  reference: string; status: string; email: string; shipping: string;
  subtotal_cents: number; shipping_cents: number | null; currency: string;
  paid_at: number | null; created_at: number;
  printful_order_id: string | null; fulfillment_status: string | null; fulfillment_error: string | null;
  units?: number;
}
function toAdminOrder(o: OrderListRow) {
  const s = JSON.parse(o.shipping || "{}") as Record<string, string>;
  return {
    reference: o.reference, status: o.status, email: o.email,
    customer: s.fullName || o.email, country: s.country || null,
    subtotalCents: o.subtotal_cents, shippingCents: o.shipping_cents ?? 0,
    totalCents: o.subtotal_cents + (o.shipping_cents ?? 0), currency: o.currency,
    paidAt: o.paid_at, createdAt: o.created_at, units: o.units ?? 0,
    printfulOrderId: o.printful_order_id,
    fulfillmentStatus: o.fulfillment_status, fulfillmentError: o.fulfillment_error,
  };
}

interface PrintfulShipment { carrier?: string; service?: string; tracking_number?: string; tracking_url?: string; ship_date?: string }
interface PrintfulOrderData { status?: string; shipments?: PrintfulShipment[] }
function mapShipments(d: PrintfulOrderData): Array<{ carrier: string | null; service: string | null; trackingNumber: string | null; trackingUrl: string | null; shipDate: string | null }> {
  return (d.shipments ?? []).map((s) => ({
    carrier: s.carrier ?? null, service: s.service ?? null,
    trackingNumber: s.tracking_number ?? null, trackingUrl: s.tracking_url ?? null, shipDate: s.ship_date ?? null,
  }));
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

      // Self-hosted Printful mockups (public GET) — durable copies so storefront URLs never expire.
      const mk = path.match(/^\/api\/mockups\/([\w.-]+)$/);
      if (mk && req.method === "GET") {
        const obj = await env.BUCKET.get(`mockups/${mk[1]}.jpg`);
        if (!obj) return json({ error: "not found" }, { status: 404 }, headers);
        return new Response(obj.body, { headers: { ...headers, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
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

      // Countries Printful ships to (public), for the checkout country picker. Each entry carries
      // its state/province list when Printful requires one (US, CA, AU, ...); otherwise states=null.
      if (path === "/api/shipping/countries" && req.method === "GET") {
        const store = await currentStore(env);
        if (!store) return json({ countries: [] }, {}, headers);
        try {
          const r = await call<{ result: Array<{ code: string; name: string; states: Array<{ code: string; name: string }> | null }> }>(env, store, "/countries");
          const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
          const countries = (r.result ?? [])
            .map((c) => ({ code: c.code, name: c.name, states: c.states ? [...c.states].sort(byName) : null }))
            .sort(byName);
          return json({ countries }, { headers: { "Cache-Control": "no-store" } }, headers);
        } catch {
          return json({ countries: [] }, {}, headers);
        }
      }

      // Live shipping quote for the checkout summary (public). Cheapest Printful rate, in cents.
      if (path === "/api/shipping/rate" && req.method === "POST") {
        const store = await currentStore(env);
        if (!store) return json({ shippingCents: null }, {}, headers);
        const b = (await req.json()) as { shipping: Record<string, string>; items: Array<{ variantId: string; qty: number }> };
        try {
          const shippingCents = await shippingRateCents(env, store, b.shipping ?? {}, b.items ?? []);
          return json({ shippingCents }, {}, headers);
        } catch {
          return json({ shippingCents: null }, {}, headers);
        }
      }

      // Payments — PayPal (docs/pod/10). Hosted; the server owns the amount.
      if (path === "/api/pay/paypal/config" && req.method === "GET") {
        return json({ configured: paypalConfigured(env), clientId: paypalClientId(env), env: env.PAYPAL_ENV ?? "sandbox" }, {}, headers);
      }
      if (path === "/api/pay/paypal/create" && req.method === "POST") {
        if (!paypalConfigured(env)) return json({ error: "PayPal is not configured yet." }, { status: 503 }, headers);
        const { reference } = (await req.json()) as { reference: string };
        const order = await env.DB.prepare("SELECT id, reference, status, subtotal_cents, shipping FROM orders WHERE reference = ?")
          .bind(reference).first<{ id: string; reference: string; status: string; subtotal_cents: number; shipping: string }>();
        if (!order) return json({ error: "Order not found" }, { status: 404 }, headers);
        if (order.status === "paid") return json({ error: "Order already paid" }, { status: 409 }, headers);
        // Validate the address by creating the Printful draft BEFORE charging, so we never take
        // money for an order Printful can't fulfil (e.g. a bad shipping address).
        const store = await currentStore(env);
        let shippingCents = 0;
        if (store) {
          try {
            await fulfillOrder(env, store, order.id, false);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const clean = msg.replace(/^Printful \d+:\s*/, "");
            return json({ error: `Can't ship this order — ${clean}` }, { status: 422 }, headers);
          }
          // Charge the customer Printful's real shipping rate on top of the subtotal.
          const { results: its } = await env.DB.prepare("SELECT variant_id, qty FROM order_items WHERE order_id = ?")
            .bind(order.id).all<{ variant_id: string; qty: number }>();
          const ship = JSON.parse(order.shipping || "{}") as Record<string, string>;
          shippingCents = (await shippingRateCents(env, store, ship, its.map((i) => ({ variantId: i.variant_id, qty: i.qty })))
            .catch(() => null)) ?? 0;
        }
        await env.DB.prepare("UPDATE orders SET shipping_cents=?1 WHERE id=?2").bind(shippingCents, order.id).run();
        const paypalOrderId = await createPaypalOrder(env, order.reference, order.subtotal_cents + shippingCents);
        await env.DB.prepare("UPDATE orders SET status='pending_payment', payment_provider='paypal', paypal_order_id=?1, updated_at=?2 WHERE id=?3")
          .bind(paypalOrderId, Date.now(), order.id).run();
        return json({ paypalOrderId, shippingCents }, {}, headers);
      }
      if (path === "/api/pay/paypal/capture" && req.method === "POST") {
        if (!paypalConfigured(env)) return json({ error: "PayPal is not configured yet." }, { status: 503 }, headers);
        const { reference, paypalOrderId } = (await req.json()) as { reference: string; paypalOrderId: string };
        const order = await env.DB.prepare("SELECT id, reference, status, subtotal_cents, shipping_cents, paypal_order_id FROM orders WHERE reference = ?")
          .bind(reference).first<{ id: string; reference: string; status: string; subtotal_cents: number; shipping_cents: number | null; paypal_order_id: string | null }>();
        if (!order) return json({ error: "Order not found" }, { status: 404 }, headers);
        if (order.status === "paid") return json({ status: "paid", reference }, {}, headers); // idempotent
        if (order.paypal_order_id !== paypalOrderId) return json({ error: "Order mismatch" }, { status: 409 }, headers);
        const cap = await capturePaypalOrder(env, paypalOrderId);
        const expected = ((order.subtotal_cents + (order.shipping_cents ?? 0)) / 100).toFixed(2);
        if (cap.status !== "COMPLETED" || cap.currency !== "USD" || cap.amountValue !== expected) {
          return json({ error: `Payment not valid (captured ${cap.amountValue} ${cap.currency})` }, { status: 402 }, headers);
        }
        await env.DB.prepare("UPDATE orders SET status='paid', paypal_capture_id=?1, paid_at=?2, updated_at=?2 WHERE id=?3")
          .bind(cap.captureId, Date.now(), order.id).run();
        await onOrderPaid(env, reference).catch(() => { /* never block the paid confirmation */ });
        return json({ status: "paid", reference }, {}, headers);
      }
      if (path === "/api/webhooks/paypal" && req.method === "POST") {
        const event = (await req.json().catch(() => ({}))) as { event_type?: string; resource?: { custom_id?: string; invoice_id?: string; id?: string } };
        if (!(await verifyWebhook(env, req.headers, event))) return json({ error: "invalid signature" }, { status: 400 }, headers);
        if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
          const reference = event.resource?.custom_id ?? event.resource?.invoice_id;
          if (reference) {
            await env.DB.prepare("UPDATE orders SET status='paid', paypal_capture_id=COALESCE(paypal_capture_id, ?1), paid_at=COALESCE(paid_at, ?2), updated_at=?2 WHERE reference=?3 AND status != 'paid'")
              .bind(event.resource?.id ?? null, Date.now(), reference).run();
          }
        }
        return json({ ok: true }, {}, headers);
      }

      // Orders (public create; owner list)
      if (path === "/api/orders" && req.method === "POST") {
        return createOrder(env, await req.json(), headers);
      }

      // Order history (admin): paid orders, newest first, with our Printful fulfilment state.
      if (path === "/api/orders" && req.method === "GET") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const { results } = await env.DB.prepare(
          `SELECT o.reference, o.status, o.email, o.shipping, o.subtotal_cents, o.shipping_cents,
                  o.currency, o.paid_at, o.created_at, o.printful_order_id, o.fulfillment_status, o.fulfillment_error,
                  COALESCE(SUM(oi.qty), 0) AS units
           FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
           WHERE o.status = 'paid'
           GROUP BY o.id
           ORDER BY o.paid_at DESC, o.created_at DESC`,
        ).all<OrderListRow>();
        return json({ orders: results.map(toAdminOrder) }, {}, headers);
      }

      // Order detail (admin): full record + items + Printful's live status/tracking (on demand).
      const detailRef = path.match(/^\/api\/orders\/([\w-]+)\/detail$/);
      if (detailRef && req.method === "GET") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const o = await env.DB.prepare(
          `SELECT id, reference, status, email, shipping, subtotal_cents, shipping_cents, currency,
                  paid_at, created_at, printful_order_id, fulfillment_status, fulfillment_error
           FROM orders WHERE reference = ?`,
        ).bind(detailRef[1]).first<OrderListRow & { id: string }>();
        if (!o) return json({ error: "not found" }, { status: 404 }, headers);
        const { results: items } = await env.DB.prepare(
          `SELECT oi.variant_label, oi.qty, oi.unit_price_cents, p.name
           FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`,
        ).bind(o.id).all<{ variant_label: string; qty: number; unit_price_cents: number; name: string | null }>();

        let printful: { status: string | null; shipments: ReturnType<typeof mapShipments> } | null = null;
        if (o.printful_order_id) {
          const store = await currentStore(env);
          if (store) {
            try {
              const r = await callMethod<{ data?: PrintfulOrderData } & PrintfulOrderData>(
                env, store, "GET", `/v2/orders/${encodeURIComponent(o.printful_order_id)}`,
              );
              const d = r.data ?? r;
              printful = { status: d.status ?? null, shipments: mapShipments(d) };
            } catch (e) {
              printful = { status: `error: ${e instanceof Error ? e.message : String(e)}`, shipments: [] };
            }
          }
        }
        const s = JSON.parse(o.shipping || "{}") as Record<string, string>;
        return json({
          order: {
            ...toAdminOrder(o), shipping: s,
            items: items.map((i) => ({ name: i.name ?? "Item", variantLabel: i.variant_label, qty: i.qty, unitPriceCents: i.unit_price_cents })),
          },
          printful,
        }, {}, headers);
      }

      // Retry Printful fulfilment for a paid order that failed (admin).
      const retryRef = path.match(/^\/api\/orders\/([\w-]+)\/retry$/);
      if (retryRef && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const o = await env.DB.prepare("SELECT id FROM orders WHERE reference = ? AND status = 'paid'")
          .bind(retryRef[1]).first<{ id: string }>();
        if (!o) return json({ error: "not found" }, { status: 404 }, headers);
        const store = await currentStore(env);
        if (!store) return json({ error: "Printful not connected" }, { status: 409 }, headers);
        try {
          await fulfillOrder(env, store, o.id, env.PAYPAL_ENV === "live");
          const row = await env.DB.prepare("SELECT fulfillment_status, printful_order_id FROM orders WHERE id = ?")
            .bind(o.id).first<{ fulfillment_status: string | null; printful_order_id: string | null }>();
          return json({ ok: true, fulfillmentStatus: row?.fulfillment_status ?? null, printfulOrderId: row?.printful_order_id ?? null }, {}, headers);
        } catch (e) {
          const msg = String(e instanceof Error ? e.message : e).slice(0, 300);
          await env.DB.prepare("UPDATE orders SET fulfillment_status='failed', fulfillment_error=?1, updated_at=?2 WHERE id=?3")
            .bind(msg, Date.now(), o.id).run().catch(() => {});
          return json({ ok: false, error: msg }, { status: 422 }, headers);
        }
      }

      const orderRef = path.match(/^\/api\/orders\/([\w-]+)$/);
      if (orderRef && req.method === "GET") {
        const row = await env.DB.prepare("SELECT * FROM orders WHERE reference = ?").bind(orderRef[1])
          .first<{ id: string; reference: string; status: string; email: string; subtotal_cents: number; currency: string }>();
        if (!row) return json({ error: "not found" }, { status: 404 }, headers);
        return json({ id: row.id, reference: row.reference, status: row.status, email: row.email, subtotalCents: row.subtotal_cents, currency: row.currency }, {}, headers);
      }

      // Mockups. POST starts the async Printful task; GET polls its status.
      if (path === "/api/mockup" && req.method === "POST") {
        const store = await currentStore(env);
        if (!store) return json({ error: "Printful is not connected" }, { status: 409 }, headers);
        return renderMockup(env, store, await req.json(), headers);
      }
      if (path === "/api/mockup" && req.method === "GET") {
        const store = await currentStore(env);
        if (!store) return json({ error: "Printful is not connected" }, { status: 409 }, headers);
        const taskId = url.searchParams.get("task");
        if (!taskId) return json({ error: "Missing task id" }, { status: 400 }, headers);
        return pollMockup(env, store, taskId, url.origin, headers);
      }
      // Draft-order test (admin): submit a print file to Printful as a DRAFT (no charge, no
      // confirm) to validate the fulfilment mapping. Returns Printful's raw response.
      if (path === "/api/fulfill/draft-test" && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const store = await currentStore(env);
        if (!store) return json({ error: "Printful not connected" }, { status: 409 }, headers);
        const b = (await req.json()) as { printFileUrl: string; variantId: number; placement: string; technique: string; retailPrice?: string };
        const orderBody = {
          external_id: `TEST-${Date.now()}`,
          recipient: { name: "Abbiss Test", address1: "1 Congress Ave", city: "Austin", state_code: "TX", country_code: "US", zip: "78701", email: "test@example.com" },
          order_items: [{
            source: "catalog", catalog_variant_id: b.variantId, quantity: 1, retail_price: b.retailPrice ?? "18.88",
            placements: [{ placement: b.placement, technique: b.technique, layers: [{ type: "file", url: b.printFileUrl }] }],
          }],
        };
        try {
          const printful = await callMethod<unknown>(env, store, "POST", "/v2/orders", orderBody);
          return json({ ok: true, printful }, {}, headers);
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, {}, headers);
        }
      }

      // Landing (My Store). Public gets the published config (or default); admin gets the draft.
      if (path === "/api/landing" && req.method === "GET") {
        const row = await env.DB.prepare("SELECT draft, published FROM landing WHERE id = 'default'")
          .first<{ draft: string | null; published: string | null }>();
        const raw = (await authed()) ? (row?.draft ?? row?.published) : row?.published;
        return json({ config: raw ? JSON.parse(raw) : null }, {}, headers);
      }
      if (path === "/api/landing" && req.method === "PUT") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const body = (await req.json()) as { config: unknown };
        await env.DB.prepare(
          "INSERT INTO landing (id, draft, updated_at) VALUES ('default', ?1, ?2) " +
          "ON CONFLICT(id) DO UPDATE SET draft = ?1, updated_at = ?2",
        ).bind(JSON.stringify(body.config), Date.now()).run();
        return json({ ok: true }, {}, headers);
      }
      if (path === "/api/landing/publish" && req.method === "POST") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const row = await env.DB.prepare("SELECT draft FROM landing WHERE id = 'default'")
          .first<{ draft: string | null }>();
        await env.DB.prepare("UPDATE landing SET published = ?1, updated_at = ?2 WHERE id = 'default'")
          .bind(row?.draft ?? null, Date.now()).run();
        return json({ ok: true }, {}, headers);
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
          mockups?: { generated: string[]; featured: string[]; byColor?: Record<string, string> } | null;
          description?: string | null; materials?: string | null;
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
          "UPDATE products SET name=?1, retail_price_cents=?2, status=?3, offered_variant_colors=?4, mockups=?5, description=?6, materials=?7, updated_at=?8 WHERE id=?9",
        ).bind(
          body.name ?? cur.name,
          body.retailPriceCents ?? cur.retail_price_cents,
          body.status ?? cur.status,
          offered, mockups,
          body.description !== undefined ? body.description : cur.description,
          body.materials !== undefined ? body.materials : cur.materials,
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
      if (prodId && req.method === "DELETE") {
        if (!(await authed())) return json({ error: "Unauthorized" }, { status: 401 }, headers);
        const cur = await env.DB.prepare("SELECT id, status, photo_key FROM products WHERE id = ?")
          .bind(prodId[1]).first<{ id: string; status: string; photo_key: string | null }>();
        if (!cur) return new Response(null, { status: 204, headers });
        // A live product can never be deleted in one click (docs/pod/08 §1).
        if (cur.status === "published") return json({ error: "Unpublish it first" }, { status: 409 }, headers);
        await env.DB.prepare("DELETE FROM designs WHERE product_id = ?").bind(prodId[1]).run();
        await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(prodId[1]).run();
        // Best-effort R2 cleanup: the base photo + this product's generated print files.
        if (cur.photo_key) await env.BUCKET.delete(cur.photo_key).catch(() => {});
        const listed = await env.BUCKET.list({ prefix: `print-files/pub-${prodId[1]}-` }).catch(() => null);
        if (listed && listed.objects.length) {
          await env.BUCKET.delete(listed.objects.map((o) => o.key)).catch(() => {});
        }
        return new Response(null, { status: 204, headers });
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
