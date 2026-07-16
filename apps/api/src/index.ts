export interface Env {
  DB: D1Database;
  /** Origenes permitidos, separados por coma. */
  ALLOWED_ORIGINS?: string;
}

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
