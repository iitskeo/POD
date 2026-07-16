export interface Env {
  DB: D1Database;
  /** Origenes permitidos, separados por coma. */
  ALLOWED_ORIGINS?: string;
  /** Credenciales de la app de Printful. Viven en .dev.vars, nunca en el codigo. */
  PRINTFUL_CLIENT_ID: string;
  PRINTFUL_CLIENT_SECRET: string;
  PRINTFUL_REDIRECT_URI?: string;
  /** A donde vuelve el admin tras conectar. */
  ADMIN_URL?: string;
}

import {
  authorizeUrl,
  call,
  catalogPath,
  exchangeCode,
  type StoreRow,
} from "./printful";

type Json = Record<string, unknown>;

function cors(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((s) => s.trim());
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
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
 * Rutas de Printful. El token nunca sale de aqui: el admin pregunta por catalogo
 * y el Worker responde ya autenticado.
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

  // Arranca el handshake. El state se guarda para verificarlo al volver.
  if (path === "/api/printful/connect") {
    const state = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)")
      .bind(state, Date.now()).run();
    return Response.redirect(authorizeUrl(env, state), 302);
  }

  if (path === "/api/printful/callback") {
    const admin = env.ADMIN_URL ?? "http://localhost:5174";
    const back = (params: string) => Response.redirect(`${admin}/?${params}`, 302);

    if (url.searchParams.get("success") === "0") return back("printful=rechazado");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back("printful=error&msg=faltan+parametros");

    // Sin verificar el state, el callback aceptaria cualquier code que le manden.
    const row = await env.DB.prepare("SELECT state FROM oauth_states WHERE state = ?")
      .bind(state).first();
    if (!row) return back("printful=error&msg=state+invalido");
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
      return back("printful=conectado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return back(`printful=error&msg=${encodeURIComponent(msg.slice(0, 120))}`);
    }
  }

  const store = await currentStore(env);
  if (!store) return json({ error: "Printful no esta conectado" }, { status: 409 }, headers);

  if (path === "/api/printful/categories") {
    // Sin limit devuelve solo 20 y el arbol queda cortado.
    const data = await call<unknown>(env, store, "/v2/catalog-categories?limit=100");
    return json(data, {}, headers);
  }

  if (path === "/api/printful/catalog") {
    const data = await call<unknown>(env, store, catalogPath(url.searchParams));
    return json(data, {}, headers);
  }

  // Todo el catalogo v2 exige la region, no solo el listado.
  const region = url.searchParams.get("selling_region_name") ?? "worldwide";
  const rq = `selling_region_name=${encodeURIComponent(region)}`;

  // Precios aparte: el listado no los trae y pedirlos para los 498 seria inviable.
  // Se piden solo para lo que el admin esta mirando.
  const prices = path.match(/^\/api\/printful\/catalog\/(\d+)\/prices$/);
  if (prices) {
    const data = await call<unknown>(env, store, `/v2/catalog-products/${prices[1]}/prices?${rq}`);
    return json(data, {}, headers);
  }

  const detail = path.match(/^\/api\/printful\/catalog\/(\d+)$/);
  if (detail) {
    const id = detail[1];
    // mockup-styles trae print_area_width/height: las medidas del template, que es
    // justo lo que hoy esta hardcodeado.
    const [product, styles, variants] = await Promise.all([
      call<unknown>(env, store, `/v2/catalog-products/${id}?${rq}`),
      call<unknown>(env, store, `/v2/catalog-products/${id}/mockup-styles?${rq}`).catch((e) => ({
        error: e instanceof Error ? e.message : String(e),
      })),
      call<unknown>(env, store, `/v2/catalog-products/${id}/catalog-variants?${rq}&limit=5`).catch(
        (e) => ({ error: e instanceof Error ? e.message : String(e) }),
      ),
    ]);
    return json({ product, styles, variants }, {}, headers);
  }

  return json({ error: "ruta printful no encontrada" }, { status: 404 }, headers);
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
          if (!row) return json({ error: "no existe" }, { status: 404 }, headers);
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
            String(body.name ?? "Sin nombre"),
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

      return json({ error: "ruta no encontrada" }, { status: 404 }, headers);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ error: msg }, { status: 500 }, headers);
    }
  },
};
