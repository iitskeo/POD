import type { Env } from "./index";

/**
 * PayPal (Orders v2) over REST, so it runs on Workers with no SDK. Hosted checkout only — we
 * never see card data. Everything is driven by env: PAYPAL_ENV picks the base URL, and the
 * client id/secret/webhook id are Worker secrets. Inert (paypalConfigured === false) until set.
 */

export function paypalBase(env: Env): string {
  return env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** The active credential set, chosen by PAYPAL_ENV so sandbox + live can coexist. Falls back
 *  to the unsuffixed names for convenience. */
function creds(env: Env): { clientId?: string; secret?: string; webhookId?: string } {
  if (env.PAYPAL_ENV === "live") {
    return {
      clientId: env.PAYPAL_CLIENT_ID_LIVE ?? env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_CLIENT_SECRET_LIVE ?? env.PAYPAL_CLIENT_SECRET,
      webhookId: env.PAYPAL_WEBHOOK_ID_LIVE ?? env.PAYPAL_WEBHOOK_ID,
    };
  }
  return {
    clientId: env.PAYPAL_CLIENT_ID_SANDBOX ?? env.PAYPAL_CLIENT_ID,
    secret: env.PAYPAL_CLIENT_SECRET_SANDBOX ?? env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID_SANDBOX ?? env.PAYPAL_WEBHOOK_ID,
  };
}

/** The client id for the active env — safe to send to the browser to load the SDK. */
export function paypalClientId(env: Env): string | null {
  return creds(env).clientId ?? null;
}

export function paypalConfigured(env: Env): boolean {
  const c = creds(env);
  return !!(c.clientId && c.secret);
}

// Cache the app access token per isolate (it lasts ~9h; refresh with slack).
let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(env: Env): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - 60_000 > Date.now()) return tokenCache.token;
  const c = creds(env);
  const auth = btoa(`${c.clientId}:${c.secret}`);
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`PayPal auth failed: ${body.error_description ?? res.status}`);
  }
  tokenCache = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function pp<T>(env: Env, path: string, init: RequestInit & { idempotencyKey?: string }): Promise<{ res: Response; body: T }> {
  const token = await accessToken(env);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const res = await fetch(`${paypalBase(env)}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as T;
  return { res, body };
}

/** Create a PayPal order for a fixed USD amount (cents), tagged with our order reference. */
export async function createPaypalOrder(env: Env, reference: string, amountCents: number): Promise<string> {
  const value = (amountCents / 100).toFixed(2);
  const { res, body } = await pp<{ id?: string; message?: string }>(env, "/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: reference,
        invoice_id: reference,
        amount: { currency_code: "USD", value },
      }],
    }),
  });
  if (!res.ok || !body.id) throw new Error(`PayPal create failed: ${body.message ?? res.status}`);
  return body.id;
}

export interface CaptureResult { captureId: string; amountValue: string; currency: string; status: string }

/** Capture an approved PayPal order. Returns the capture id + captured amount to verify. */
export async function capturePaypalOrder(env: Env, paypalOrderId: string): Promise<CaptureResult> {
  const { res, body } = await pp<{
    status?: string; message?: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string; amount: { value: string; currency_code: string }; status: string }> } }>;
  }>(env, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    idempotencyKey: `cap-${paypalOrderId}`,
  });
  const cap = body.purchase_units?.[0]?.payments?.captures?.[0];
  if (!res.ok || !cap) throw new Error(`PayPal capture failed: ${body.message ?? res.status}`);
  return { captureId: cap.id, amountValue: cap.amount.value, currency: cap.amount.currency_code, status: cap.status };
}

/** Verify a webhook came from PayPal (so a spoofed POST can't mark an order paid). */
export async function verifyWebhook(env: Env, headers: Headers, event: unknown): Promise<boolean> {
  const webhookId = creds(env).webhookId;
  if (!webhookId) return false;
  const { res, body } = await pp<{ verification_status?: string }>(env, "/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  return res.ok && body.verification_status === "SUCCESS";
}
