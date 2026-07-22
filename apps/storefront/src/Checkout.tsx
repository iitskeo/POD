import { useState } from "react";
import { cart, useCart } from "./cartStore";
import { api } from "./api";
import { navigate } from "./App";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export function Checkout() {
  const lines = useCart();
  const [f, setF] = useState({ email: "", fullName: "", address1: "", address2: "", city: "", state: "CA", zip: "" });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  if (lines.length === 0) { navigate("/"); return null; }
  const subtotal = cart.subtotalCents();
  const valid = f.email.includes("@") && f.fullName && f.address1 && f.city && f.zip;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const { reference } = await api.createOrder({
        email: f.email, notify,
        shipping: { fullName: f.fullName, address1: f.address1, address2: f.address2, city: f.city, state: f.state, zip: f.zip, country: "US" },
        items: lines.map((l) => ({ productId: l.productId, designId: l.designId, variantId: l.variantId, variantLabel: l.variantLabel, slotValues: l.slotValues, qty: l.qty })),
      });
      cart.clear();
      navigate(`/order/${reference}`);
    } catch (e) { setError(String((e as Error).message ?? e)); setBusy(false); }
  };

  return (
    <div className="checkout">
      <form className="co-form" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <h1>Checkout</h1>
        <span className="eyebrow">Contact</span>
        <input type="email" placeholder="Email" value={f.email} onChange={(e) => set("email", e.target.value)} required />
        <span className="eyebrow">Shipping address (US)</span>
        <input placeholder="Full name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <input placeholder="Address" value={f.address1} onChange={(e) => set("address1", e.target.value)} />
        <input placeholder="Apt, suite (optional)" value={f.address2} onChange={(e) => set("address2", e.target.value)} />
        <div className="row3">
          <input placeholder="City" value={f.city} onChange={(e) => set("city", e.target.value)} />
          <select value={f.state} onChange={(e) => set("state", e.target.value)}>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
          <input placeholder="ZIP" value={f.zip} onChange={(e) => set("zip", e.target.value)} />
        </div>
        <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify me when payments launch</label>
        {error && <p className="hint warn">{error}</p>}
      </form>

      <aside className="co-summary">
        <span className="eyebrow">Order summary</span>
        {lines.map((l) => <div className="co-line" key={l.key}><span>{l.name} · {l.variantLabel} × {l.qty}</span><span className="mono">${((l.unitPriceCents * l.qty) / 100).toFixed(2)}</span></div>)}
        <div className="co-total mono">Subtotal <strong>${(subtotal / 100).toFixed(2)}</strong></div>
        <p className="hint">Shipping &amp; taxes: coming soon.</p>
        <button className="cta wide" disabled title="Coming soon">Pay <span className="mono soon">Coming soon</span></button>
        <button className="btn wide" disabled={!valid || busy} onClick={submit}>{busy ? "Saving…" : "Save my design & notify me"}</button>
      </aside>
    </div>
  );
}
