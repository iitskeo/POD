import type { Env } from "./index";

const AUTH_URL = "https://www.printful.com/oauth/authorize";
const TOKEN_URL = "https://www.printful.com/oauth/token";
const API = "https://api.printful.com";

export interface StoreRow {
  id: string;
  external_id: string | null;
  name: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
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

/** Llama a la API de Printful con el token de la tienda. */
export async function call<T>(store: StoreRow, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${store.access_token}` },
  });
  const body = (await res.json()) as Record<string, unknown>;
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

export function catalogPath(params: URLSearchParams): string {
  const q = new URLSearchParams();
  q.set("limit", params.get("limit") ?? "20");
  q.set("offset", params.get("offset") ?? "0");
  for (const k of ["category_ids", "colors", "techniques", "sort_type"]) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  return `/v2/catalog-products?${q}`;
}
