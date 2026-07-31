import type { Env } from "./index";

/**
 * Owner sales notification via Resend (docs/pod/10). No custom domain needed: on the free
 * tier Resend sends from `onboarding@resend.dev` to the account owner's own address, which is
 * exactly what we want for now. Inert (no-op) until RESEND_API_KEY + OWNER_EMAIL are set.
 * Best-effort: never throws, so a mail hiccup can't affect the paid/fulfilled flow.
 */
export async function notifyOwnerOfSale(env: Env, o: {
  reference: string; email: string; subtotalCents: number;
  items: Array<{ name: string; variantLabel: string; qty: number }>;
  shipping: Record<string, unknown>;
}): Promise<void> {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  const total = `$${(o.subtotalCents / 100).toFixed(2)}`;
  const s = o.shipping;
  const items = o.items.map((i) => `• ${i.name} — ${i.variantLabel} × ${i.qty}`).join("\n");
  const text =
    `New paid order ${o.reference} (${total})\n\n` +
    `Customer: ${o.email}\n\n` +
    `Items:\n${items}\n\n` +
    `Ship to:\n${s.fullName ?? ""}\n${s.address1 ?? ""} ${s.address2 ?? ""}\n` +
    `${s.city ?? ""}, ${s.state ?? ""} ${s.zip ?? ""}, ${s.country ?? "US"}`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Abbiss <onboarding@resend.dev>",
        to: [env.OWNER_EMAIL],
        reply_to: o.email,
        subject: `New order ${o.reference} — ${total}`,
        text,
      }),
    });
  } catch { /* best-effort */ }
}
