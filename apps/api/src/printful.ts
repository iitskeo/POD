import type { Env } from "./index";

const AUTH_URL = "https://www.printful.com/oauth/authorize";
const TOKEN_URL = "https://www.printful.com/oauth/token";
const API = "https://api.printful.com";

export interface StoreRow {
  id: string;
  external_id: string | null;
  name: string | null;
  /** Mutable: `call` lo actualiza al renovar. */
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
}

/** Categoria del catalogo de Printful. */
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
    throw new Error(`Printful rechazo el code: ${JSON.stringify(body).slice(0, 300)}`);
  }
  // Printful envuelve algunas respuestas en { result: ... }; otras no.
  const data = (body.result ?? body) as TokenResponse;
  if (!data.access_token) throw new Error("Printful no devolvio access_token");
  return data;
}

async function refresh(env: Env, store: StoreRow): Promise<string> {
  if (!store.refresh_token) {
    throw new Error("El token expiro y no hay refresh_token. Vuelve a conectar Printful.");
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
    throw new Error(`No se pudo renovar el token: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const tok = (body.result ?? body) as TokenResponse;
  if (!tok.access_token) throw new Error("El refresh no devolvio access_token");

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
 * Llama a la API de Printful, renovando el token si hace falta.
 *
 * Los tokens de Printful expiran. Sin esto la conexion funciona un rato y luego
 * empieza a dar 401 sin explicacion: hay que reconectar a mano cada vez.
 */
export async function call<T>(env: Env, store: StoreRow, path: string): Promise<T> {
  // Renovacion preventiva: 60s de margen para no pelear con el reloj.
  if (store.expires_at && store.expires_at - 60_000 < Date.now()) {
    await refresh(env, store);
  }

  let { res, body } = await raw(store.access_token, path);

  // Reactiva: expires_at puede faltar o mentir, y el 401 es la unica verdad.
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

/**
 * Regiones de venta validas de Printful. Ojo: no existe "usa", es "north_america".
 */
export const SELLING_REGIONS = [
  "worldwide", "north_america", "canada", "europe", "spain", "latvia", "uk",
  "france", "germany", "australia", "japan", "new_zealand", "italy", "brazil",
  "southeast_asia", "republic_of_korea", "all",
] as const;

export function catalogPath(params: URLSearchParams): string {
  const q = new URLSearchParams();
  q.set("limit", params.get("limit") ?? "20");
  q.set("offset", params.get("offset") ?? "0");

  // La doc dice que tiene default "worldwide", pero la API responde
  // "Selling region not found" si no viaja explicito. Se manda siempre.
  const region = params.get("selling_region_name") ?? "worldwide";
  if (!(SELLING_REGIONS as readonly string[]).includes(region)) {
    throw new Error(`Region invalida: ${region}. Validas: ${SELLING_REGIONS.join(", ")}`);
  }
  q.set("selling_region_name", region);

  for (const k of ["category_ids", "colors", "techniques", "sort_type", "sort_direction", "new"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  return `/v2/catalog-products?${q}`;
}
