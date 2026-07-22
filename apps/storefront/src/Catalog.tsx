import { useEffect, useState } from "react";
import type { Product } from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function Catalog() {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => { api.listProducts().then(setProducts).catch(() => setProducts([])); }, []);

  return (
    <div className="catalog">
      <section className="hero">
        <span className="eyebrow">Print on demand</span>
        <h1>Make it yours.</h1>
        <p className="lede">Personalize a product and see it on the real thing before you buy. No account needed.</p>
      </section>

      {products === null ? (
        <div className="grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card skeleton" />)}</div>
      ) : products.length === 0 ? (
        <p className="hint pad">No products published yet.</p>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <a key={p.id} className="card" href={`/p/${p.slug}`} onClick={(e) => { e.preventDefault(); navigate(`/p/${p.slug}`); }}>
              <div className="card-img">{p.hasPhoto ? <img src={api.productPhotoUrl(p.id)} alt={p.name} /> : <div className="ph" />}</div>
              <div className="card-body">
                <h3>{p.name}</h3>
                <span className="mono price">from ${(p.retailPriceCents / 100).toFixed(2)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
