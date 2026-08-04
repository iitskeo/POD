import type { Env } from "./index";
import { callMethod, type StoreRow } from "./printful";

interface OrderRow { id: string; reference: string; email: string; shipping: string }
interface ItemRow { product_id: string; variant_id: string; qty: number; print_files: string | null; unit_price_cents: number }

/**
 * Create the Printful order for a paid order (docs/pod/10 §6). Runs after capture. Uses the
 * print files rendered + stored at checkout (the Worker can't render canvas). `confirm=false`
 * (sandbox/testing) creates a draft in Printful with no charge; `confirm=true` (live) submits
 * it to production. Idempotent: skips if the order already has a printful_order_id.
 */
export async function fulfillOrder(env: Env, store: StoreRow, orderId: string, confirm: boolean): Promise<void> {
  const order = await env.DB.prepare(
    "SELECT id, reference, email, shipping, printful_order_id FROM orders WHERE id = ?",
  ).bind(orderId).first<OrderRow & { printful_order_id: string | null }>();
  if (!order) return;
  // The draft may already exist (created at address validation, before payment). In that case
  // just confirm it when going live; otherwise it stays a draft.
  if (order.printful_order_id) {
    if (confirm) await callMethod(env, store, "POST", `/v2/orders/${encodeURIComponent(order.printful_order_id)}/confirmation`);
    return;
  }

  const { results: items } = await env.DB.prepare(
    "SELECT product_id, variant_id, qty, print_files, unit_price_cents FROM order_items WHERE order_id = ?",
  ).bind(orderId).all<ItemRow>();

  const orderItems: unknown[] = [];
  for (const it of items) {
    const files = it.print_files ? (JSON.parse(it.print_files) as Record<string, string>) : {};
    if (!Object.keys(files).length) throw new Error(`Item ${it.product_id} has no print files`);
    const prod = await env.DB.prepare("SELECT placements FROM products WHERE id = ?")
      .bind(it.product_id).first<{ placements: string }>();
    const placements = prod ? (JSON.parse(prod.placements) as Array<{ placement: string; technique: string }>) : [];
    const techniqueOf = (p: string) => placements.find((x) => x.placement === p)?.technique ?? "dtg";
    orderItems.push({
      source: "catalog",
      catalog_variant_id: Number(it.variant_id),
      quantity: it.qty || 1,
      retail_price: (it.unit_price_cents / 100).toFixed(2),
      placements: Object.entries(files).map(([placement, url]) => ({
        placement, technique: techniqueOf(placement), layers: [{ type: "file", url }],
      })),
    });
  }
  if (!orderItems.length) return;

  const s = JSON.parse(order.shipping || "{}") as Record<string, string>;
  const body = {
    external_id: order.reference,
    recipient: {
      name: s.fullName || order.email,
      address1: s.address1, address2: s.address2 || undefined,
      city: s.city, state_code: s.state, country_code: s.country || "US", zip: s.zip,
      email: order.email,
    },
    order_items: orderItems,
  };

  const json = await callMethod<{ data?: { id?: number | string }; id?: number | string }>(
    env, store, "POST", "/v2/orders", body,
  );
  const printfulId = String(json.data?.id ?? json.id ?? "");

  await env.DB.prepare(
    "UPDATE orders SET printful_order_id=?1, fulfillment_status='submitted', fulfillment_error=NULL, updated_at=?2 WHERE id=?3",
  ).bind(printfulId, Date.now(), orderId).run();

  if (confirm && printfulId) {
    await callMethod(env, store, "POST", `/v2/orders/${encodeURIComponent(printfulId)}/confirmation`);
  }
}
