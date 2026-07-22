import { useEffect, useState } from "react";
import type { StoredOrder } from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function OrderSaved({ reference }: { reference: string }) {
  const [order, setOrder] = useState<StoredOrder | null>(null);
  useEffect(() => { api.order(reference).then(setOrder).catch(() => {}); }, [reference]);

  return (
    <div className="order-saved">
      <span className="eyebrow">Order saved</span>
      <h1>Your design is saved.</h1>
      <p className="lede">Payments are coming soon — we'll email you when you can complete this order.</p>
      <div className="ref mono">Reference: <strong>{reference}</strong></div>
      {order && <p className="hint">Subtotal ${(order.subtotalCents / 100).toFixed(2)} · saved to {order.email}</p>}
      <button className="btn" onClick={() => navigate("/")}>Back to catalog</button>
    </div>
  );
}
