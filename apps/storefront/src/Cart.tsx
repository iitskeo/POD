import { cart, useCart } from "./cartStore";
import { navigate } from "./App";

export function Cart() {
  const lines = useCart();
  const subtotal = cart.subtotalCents();

  if (lines.length === 0) {
    return (
      <div className="empty-cart">
        <p className="hint">Your cart is empty.</p>
        <button className="btn" onClick={() => navigate("/")}>Browse products</button>
      </div>
    );
  }

  return (
    <div className="cart">
      <h1>Cart</h1>
      <div className="cart-lines">
        {lines.map((l) => (
          <div className="cart-line" key={l.key}>
            {l.previewUrl && <img className="thumb" src={l.previewUrl} alt="" />}
            <div className="cl-info">
              <div className="cl-name">{l.name}</div>
              <div className="hint">{l.variantLabel}</div>
              <div className="hint">{Object.entries(l.slotValues).map(([k, v]) => `${k.split(".").pop()}: ${v}`).join(" · ")}</div>
            </div>
            <div className="cl-qty">
              <button className="mini" onClick={() => cart.setQty(l.key, l.qty - 1)}>−</button>
              <span className="mono">{l.qty}</span>
              <button className="mini" onClick={() => cart.setQty(l.key, l.qty + 1)}>+</button>
            </div>
            <div className="mono price">${((l.unitPriceCents * l.qty) / 100).toFixed(2)}</div>
            <button className="mini remove" onClick={() => cart.remove(l.key)}>×</button>
          </div>
        ))}
      </div>
      <div className="cart-foot">
        <div className="mono">Subtotal <strong>${(subtotal / 100).toFixed(2)}</strong></div>
        <p className="hint">Shipping &amp; taxes calculated at payment — coming soon.</p>
        <button className="cta" onClick={() => navigate("/checkout")}>Checkout</button>
      </div>
    </div>
  );
}
