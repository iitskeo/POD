import { useEffect, useRef, useState } from "react";
import { cart, useCart } from "./cartStore";
import { api } from "./api";
import { navigate } from "./App";

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// Load the PayPal JS SDK once. `enable-funding=card` keeps the guest debit/credit button
// visible so shoppers can pay by card without a PayPal account.
let sdkPromise: Promise<PayPalNamespace | null> | null = null;
function loadPaypalSdk(clientId: string): Promise<PayPalNamespace | null> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (window.paypal) return resolve(window.paypal);
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&components=buttons&enable-funding=card`;
    s.onload = () => resolve(window.paypal ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return sdkPromise;
}

interface PayPalNamespace { Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => void } }
declare global { interface Window { paypal?: PayPalNamespace } }

function PayPalButtons({ clientId, buildPayload, onPaid, onError }: {
  clientId: string;
  buildPayload: () => unknown | null;
  onPaid: (reference: string) => void;
  onError: (msg: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const buildRef = useRef(buildPayload); buildRef.current = buildPayload;
  const st = useRef({ reference: "" });

  useEffect(() => {
    let cancelled = false;
    loadPaypalSdk(clientId).then((paypal) => {
      if (cancelled || !ref.current || !paypal) { if (!paypal) onError("Couldn't load PayPal."); return; }
      paypal.Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },
        createOrder: async () => {
          const payload = buildRef.current();
          if (!payload) { onError("Complete your shipping details first."); throw new Error("invalid form"); }
          const { reference } = await api.createOrder(payload);
          st.current.reference = reference;
          const { paypalOrderId } = await api.paypalCreate(reference);
          return paypalOrderId;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await api.paypalCapture(st.current.reference, data.orderID);
          if (res.status === "paid") { cart.clear(); onPaid(st.current.reference); }
          else onError("Payment could not be completed.");
        },
        onError: (e: unknown) => onError(e instanceof Error ? e.message : "Payment error."),
      }).render(ref.current);
    });
    return () => { cancelled = true; };
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className="paypal-buttons" />;
}

export function Checkout() {
  const lines = useCart();
  const [f, setF] = useState({ email: "", fullName: "", address1: "", address2: "", city: "", state: "CA", zip: "" });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pp, setPp] = useState<{ configured: boolean; clientId: string | null } | null>(null);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api.paypalConfig().then(setPp).catch(() => setPp({ configured: false, clientId: null })); }, []);

  if (lines.length === 0) { navigate("/"); return null; }
  const subtotal = cart.subtotalCents();
  const valid = f.email.includes("@") && !!f.fullName && !!f.address1 && !!f.city && !!f.zip;

  const payload = () => valid ? {
    email: f.email, notify,
    shipping: { fullName: f.fullName, address1: f.address1, address2: f.address2, city: f.city, state: f.state, zip: f.zip, country: "US" },
    items: lines.map((l) => ({ productId: l.productId, designId: l.designId, variantId: l.variantId, variantLabel: l.variantLabel, slotValues: l.slotValues, qty: l.qty })),
  } : null;

  // Fallback (no payments configured yet): save the design and capture the email.
  const saveDraft = async () => {
    const body = payload(); if (!body) return;
    setBusy(true); setError(null);
    try {
      const { reference } = await api.createOrder(body);
      cart.clear(); navigate(`/order/${reference}`);
    } catch (e) { setError(String((e as Error).message ?? e)); setBusy(false); }
  };

  return (
    <div className="checkout">
      <form className="co-form" onSubmit={(e) => e.preventDefault()}>
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
        {error && <p className="hint warn">{error}</p>}
      </form>

      <aside className="co-summary">
        <span className="eyebrow">Order summary</span>
        {lines.map((l) => <div className="co-line" key={l.key}><span>{l.name} · {l.variantLabel} × {l.qty}</span><span className="mono">${((l.unitPriceCents * l.qty) / 100).toFixed(2)}</span></div>)}
        <div className="co-total mono">Subtotal <strong>${(subtotal / 100).toFixed(2)}</strong></div>
        <p className="hint">Shipping &amp; taxes calculated by the printer.</p>

        {pp?.configured && pp.clientId ? (
          <>
            {!valid && <p className="hint">Fill in your email and shipping address to pay.</p>}
            <PayPalButtons clientId={pp.clientId} buildPayload={payload}
              onPaid={(reference) => navigate(`/order/${reference}`)} onError={setError} />
          </>
        ) : (
          <>
            <button className="cta wide" disabled title="Coming soon">Pay <span className="mono soon">Coming soon</span></button>
            <button className="btn wide" disabled={!valid || busy} onClick={saveDraft}>{busy ? "Saving…" : "Save my design & notify me"}</button>
            <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify me when payments launch</label>
          </>
        )}
      </aside>
    </div>
  );
}
