import { useEffect, useMemo, useRef, useState } from "react";
import { makeResolver, renderPrintFilePng, defaultValues } from "@abbiss/preview-engine";
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
  buildPayload: () => Promise<unknown | null>;
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
          const payload = await buildRef.current();
          if (!payload) { onError("Complete your shipping details first."); throw new Error("invalid form"); }
          try {
            const { reference } = await api.createOrder(payload);
            st.current.reference = reference;
            const { paypalOrderId } = await api.paypalCreate(reference); // validates the address before charging
            return paypalOrderId;
          } catch (e) {
            onError(e instanceof Error ? e.message : "Couldn't start payment.");
            throw e;
          }
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

interface Country { code: string; name: string; states: Array<{ code: string; name: string }> | null }
// Used only until Printful's country list loads (or if it fails); keeps US checkout working.
const US_FALLBACK: Country[] = [{ code: "US", name: "United States", states: STATES.map((s) => ({ code: s, name: s })) }];

export function Checkout() {
  const lines = useCart();
  const [f, setF] = useState({ email: "", fullName: "", address1: "", address2: "", city: "", state: "CA", zip: "", country: "US" });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pp, setPp] = useState<{ configured: boolean; clientId: string | null } | null>(null);
  const [countries, setCountries] = useState<Country[]>(US_FALLBACK);
  const [shipCents, setShipCents] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { api.paypalConfig().then(setPp).catch(() => setPp({ configured: false, clientId: null })); }, []);
  useEffect(() => {
    api.shippingCountries()
      .then((r) => { if (r.countries.length) setCountries(r.countries); })
      .catch(() => { /* keep the US fallback */ });
  }, []);

  if (lines.length === 0) { navigate("/"); return null; }
  const subtotal = cart.subtotalCents();
  const curCountry = countries.find((c) => c.code === f.country) ?? countries[0];
  const states = curCountry?.states ?? null;
  const hasStates = !!states?.length;
  // Some Printful destinations have no postal code; only require ZIP where a state is also required.
  const zipReq = hasStates;
  const valid = f.email.includes("@") && !!f.fullName && !!f.address1 && !!f.city
    && (!hasStates || !!f.state) && (!zipReq || !!f.zip);

  // When the buyer switches country, reset the state to that country's first option (or clear it).
  const setCountry = (code: string) => {
    const c = countries.find((x) => x.code === code);
    setF((s) => ({ ...s, country: code, state: c?.states?.length ? c.states[0].code : "" }));
  };

  // Quote Printful's live shipping once the address is complete, so the buyer sees the real
  // total before paying. Debounced; the server recomputes + owns the amount at charge time.
  const addrReady = !!f.address1 && !!f.city && (!hasStates || !!f.state) && (!zipReq || !!f.zip);
  const shipItems = lines.map((l) => ({ variantId: l.variantId, qty: l.qty }));
  const shipKey = JSON.stringify([f.country, f.address1, f.city, f.state, f.zip, shipItems]);
  useEffect(() => {
    if (!addrReady) { setShipCents(null); return; }
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.shippingRate({ address1: f.address1, city: f.city, state: f.state, zip: f.zip, country: f.country }, shipItems)
        .then((r) => { if (live) setShipCents(r.shippingCents); })
        .catch(() => { if (live) setShipCents(null); })
        .finally(() => { if (live) setQuoting(false); });
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [shipKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolver = useMemo(() => makeResolver(api), []);

  // Render each item's print files (customer's exact design) and upload them, so the order can
  // be submitted to Printful after payment. Runs when the buyer clicks pay.
  const buildPayload = async () => {
    if (!valid) return null;
    const items = [];
    for (const l of lines) {
      const printFiles: Record<string, string> = {};
      try {
        const [product, design] = await Promise.all([api.product(l.productId), api.designForProduct(l.productId)]);
        const values = { ...defaultValues(design.elements), ...l.slotValues };
        for (const pl of product.placements) {
          if (!design.elements.some((e) => e.placement === pl.placement)) continue;
          const png = await renderPrintFilePng(pl, design.elements, values, resolver);
          const { url } = await api.uploadPrintFile(`ord-${l.productId}-${pl.placement}-${Date.now()}`, png);
          printFiles[pl.placement] = url;
        }
      } catch { /* order still proceeds; fulfilment will flag a missing print file */ }
      items.push({ productId: l.productId, designId: l.designId, variantId: l.variantId, variantLabel: l.variantLabel, slotValues: l.slotValues, qty: l.qty, printFiles });
    }
    return {
      email: f.email, notify,
      shipping: { fullName: f.fullName, address1: f.address1, address2: f.address2, city: f.city, state: f.state, zip: f.zip, country: f.country },
      items,
    };
  };

  // Fallback (no payments configured yet): save the design and capture the email.
  const saveDraft = async () => {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const body = await buildPayload();
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
        <span className="eyebrow">Shipping address</span>
        <input placeholder="Full name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <select value={f.country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <input placeholder="Address" value={f.address1} onChange={(e) => set("address1", e.target.value)} />
        <input placeholder="Apt, suite (optional)" value={f.address2} onChange={(e) => set("address2", e.target.value)} />
        <div className="row3">
          <input placeholder="City" value={f.city} onChange={(e) => set("city", e.target.value)} />
          {hasStates
            ? <select value={f.state} onChange={(e) => set("state", e.target.value)}>{states!.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
            : <input placeholder="State / Province (optional)" value={f.state} onChange={(e) => set("state", e.target.value)} />}
          <input placeholder={zipReq ? "ZIP" : "Postal code (optional)"} value={f.zip} onChange={(e) => set("zip", e.target.value)} />
        </div>
        {error && <p className="hint warn">{error}</p>}
      </form>

      <aside className="co-summary">
        <span className="eyebrow">Order summary</span>
        {lines.map((l) => <div className="co-line" key={l.key}><span>{l.name} · {l.variantLabel} × {l.qty}</span><span className="mono">${((l.unitPriceCents * l.qty) / 100).toFixed(2)}</span></div>)}
        <div className="co-line mono"><span>Subtotal</span><span>${(subtotal / 100).toFixed(2)}</span></div>
        <div className="co-line mono">
          <span>Shipping</span>
          <span>{!addrReady ? "—" : quoting ? "…" : shipCents != null ? `$${(shipCents / 100).toFixed(2)}` : "—"}</span>
        </div>
        <div className="co-total mono">Total <strong>${((subtotal + (shipCents ?? 0)) / 100).toFixed(2)}</strong></div>
        <p className="hint">{addrReady ? "Real shipping from the printer. Taxes may apply." : "Enter your address to see shipping."}</p>

        {pp?.configured && pp.clientId ? (
          <>
            {!valid && <p className="hint">Fill in your email and shipping address to pay.</p>}
            <PayPalButtons clientId={pp.clientId} buildPayload={buildPayload}
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
