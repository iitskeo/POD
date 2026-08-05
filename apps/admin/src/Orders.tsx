import { useEffect, useState } from "react";
import { Icon, type AdminOrder, type AdminOrderDetail, type PrintfulStatus } from "@abbiss/preview-engine";
import { api } from "./api";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Fulfilment state as a coloured badge. `null` = paid but not yet sent to Printful. */
function FulfillBadge({ status }: { status: string | null }) {
  const label = status === "submitted" ? "Sent to Printful" : status === "failed" ? "Failed" : "Not sent";
  const tone = status === "submitted" ? "ok" : status === "failed" ? "bad" : "wait";
  return <span className="fbadge" data-tone={tone}>{label}</span>;
}

/** Order history (only paid orders). Row click opens a detail with Printful's live status. */
export function Orders() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = () => api.adminOrders().then((r) => setOrders(r.orders)).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { load(); }, []);

  const patchRow = (o: AdminOrder) => setOrders((os) => (os ? os.map((x) => (x.reference === o.reference ? o : x)) : os));

  return (
    <div className="orders pad">
      <h1 className="page-title">Orders</h1>
      {error && <p className="hint warn">{error}</p>}
      {orders && orders.length === 0 && <p className="hint">No paid orders yet.</p>}

      {orders && orders.length > 0 && (
        <div className="order-table">
          <div className="order-head">
            <span>Date</span><span>Order</span><span>Customer</span><span className="num">Items</span>
            <span className="num">Total</span><span>Fulfilment</span>
          </div>
          {orders.map((o) => (
            <button className="order-row" key={o.reference} onClick={() => setOpen(o.reference)}>
              <span className="hint">{when(o.paidAt ?? o.createdAt)}</span>
              <span className="mono">{o.reference}</span>
              <span className="ellip">{o.customer}{o.country ? ` · ${o.country}` : ""}</span>
              <span className="num">{o.units}</span>
              <span className="num mono">{money(o.totalCents)}</span>
              <FulfillBadge status={o.fulfillmentStatus} />
            </button>
          ))}
        </div>
      )}

      {open && <OrderDetail reference={open} onClose={() => setOpen(null)} onChanged={patchRow} />}
    </div>
  );
}

function OrderDetail({ reference, onClose, onChanged }: {
  reference: string; onClose: () => void; onChanged: (o: AdminOrder) => void;
}) {
  const [data, setData] = useState<{ order: AdminOrderDetail; printful: PrintfulStatus | null } | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const load = () => api.adminOrder(reference).then(setData).catch((e) => setError(String(e.message ?? e)));
  useEffect(() => { load(); }, [reference]);

  const retry = async () => {
    setRetrying(true); setError("");
    try {
      const res = await api.retryFulfillment(reference);
      if (!res.ok) setError(res.error ?? "Retry failed");
      const fresh = await api.adminOrder(reference);
      setData(fresh);
      onChanged(fresh.order);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setRetrying(false);
  };

  const o = data?.order;
  const s = o?.shipping ?? {};
  const pf = data?.printful;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Order · {reference}</strong>
          <button className="mini" title="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {error && <p className="hint warn">{error}</p>}
        {!o && !error && <p className="hint">Loading…</p>}

        {o && (
          <div className="order-detail">
            <div className="od-cols">
              <section>
                <span className="eyebrow">Ship to</span>
                <p className="od-addr">
                  {s.fullName && <>{s.fullName}<br /></>}
                  {s.address1}{s.address2 ? `, ${s.address2}` : ""}<br />
                  {[s.city, s.state, s.zip].filter(Boolean).join(", ")}<br />
                  {s.country}
                </p>
                <span className="eyebrow">Contact</span>
                <p className="hint">{o.email}</p>
              </section>
              <section>
                <span className="eyebrow">Items</span>
                {o.items.map((it, i) => (
                  <div className="od-line" key={i}>
                    <span className="ellip">{it.name} · {it.variantLabel} × {it.qty}</span>
                    <span className="mono">{money(it.unitPriceCents * it.qty)}</span>
                  </div>
                ))}
                <div className="od-line"><span>Subtotal</span><span className="mono">{money(o.subtotalCents)}</span></div>
                <div className="od-line"><span>Shipping</span><span className="mono">{money(o.shippingCents)}</span></div>
                <div className="od-line strong"><span>Total</span><span className="mono">{money(o.totalCents)}</span></div>
              </section>
            </div>

            <section className="od-fulfil">
              <span className="eyebrow">Fulfilment</span>
              <div className="od-fulfil-row">
                <FulfillBadge status={o.fulfillmentStatus} />
                {o.printfulOrderId && <span className="hint">Printful #{o.printfulOrderId}{pf?.status ? ` · ${pf.status}` : ""}</span>}
                <div className="spacer" />
                {(o.fulfillmentStatus === "failed" || !o.printfulOrderId) && (
                  <button className="cta" disabled={retrying} onClick={retry}>{retrying ? "Retrying…" : "Retry fulfilment"}</button>
                )}
              </div>
              {o.fulfillmentError && <p className="hint warn">{o.fulfillmentError}</p>}
              {pf?.shipments && pf.shipments.length > 0 && (
                <div className="od-tracking">
                  {pf.shipments.map((sh, i) => (
                    <div className="od-line" key={i}>
                      <span>{[sh.carrier, sh.service].filter(Boolean).join(" ") || "Shipment"}</span>
                      {sh.trackingUrl
                        ? <a className="mono" href={sh.trackingUrl} target="_blank" rel="noreferrer">{sh.trackingNumber ?? "Track"}</a>
                        : <span className="mono">{sh.trackingNumber ?? "—"}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
