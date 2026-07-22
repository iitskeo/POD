import type { Env } from "./index";

const COOKIE = "abbiss_admin";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // one week

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

/** A signed, expiring token: `<payload>.<hmac>`, both base64url. */
async function sign(env: Env, exp: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ exp })));
  const key = await hmacKey(env.SESSION_SIGNING_KEY);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

async function verify(env: Env, token: string): Promise<boolean> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const key = await hmacKey(env.SESSION_SIGNING_KEY);
  const expected = b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  if (expected !== sig) return false;
  try {
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req: Request): string | null {
  const header = req.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

/** True if the request carries a valid admin session cookie. */
export async function isAuthed(req: Request, env: Env): Promise<boolean> {
  const token = readCookie(req);
  return token ? verify(env, token) : false;
}

function cookieHeader(value: string, maxAgeSec: number): string {
  // Same-site: admin and API share the kene00vargas.workers.dev registrable domain.
  return `${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}`;
}

export async function login(req: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const { passphrase } = (await req.json()) as { passphrase?: string };
  const ok = passphrase && (await sha256Hex(passphrase)) === env.ADMIN_PASSPHRASE_HASH;
  if (!ok) {
    return new Response(JSON.stringify({ error: "Wrong passphrase" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }
  const token = await sign(env, Date.now() + TTL_MS);
  return new Response(null, {
    status: 204,
    headers: { ...headers, "Set-Cookie": cookieHeader(token, TTL_MS / 1000) },
  });
}

export function logout(headers: HeadersInit): Response {
  return new Response(null, {
    status: 204,
    headers: { ...headers, "Set-Cookie": cookieHeader("", 0) },
  });
}

export async function session(req: Request, env: Env, headers: HeadersInit): Promise<Response> {
  return new Response(JSON.stringify({ authenticated: await isAuthed(req, env) }), {
    headers: { "Content-Type": "application/json", ...headers },
  });
}
