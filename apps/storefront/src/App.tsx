import { useEffect, useState } from "react";
import { api } from "./api";
import { useCart } from "./cartStore";
import { Catalog } from "./Catalog";
import { ProductDetail } from "./ProductDetail";
import { Customizer } from "./Customizer";
import { Cart } from "./Cart";
import { Checkout } from "./Checkout";
import { OrderSaved } from "./OrderSaved";

export function navigate(to: string) {
  history.pushState({}, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
}

function usePath(): string {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const cartLines = useCart();
  const count = cartLines.reduce((n, l) => n + l.qty, 0);
  const [brand, setBrand] = useState("Abbiss");

  useEffect(() => {
    api.getLanding().then((r) => {
      const name = r.config?.brandName?.trim();
      if (name) { setBrand(name); document.title = name; }
    }).catch(() => {});
  }, []);

  let page;
  const p = path.replace(/\/+$/, "") || "/";
  const seg = p.split("/").filter(Boolean);
  if (p === "/") page = <Catalog />;
  else if (seg[0] === "p") page = <ProductDetail slug={seg[1]} />;
  else if (seg[0] === "customize") page = <Customizer slug={seg[1]} />;
  else if (p === "/cart") page = <Cart />;
  else if (p === "/checkout") page = <Checkout />;
  else if (seg[0] === "order") page = <OrderSaved reference={seg[1]} />;
  else page = <Catalog />;

  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>{brand}</a>
        <a className="cart-link mono" href="/cart" onClick={(e) => { e.preventDefault(); navigate("/cart"); }}>
          Cart{count > 0 && <span className="count">{count}</span>}
        </a>
      </header>
      <main className="site-main">{page}</main>
    </>
  );
}
