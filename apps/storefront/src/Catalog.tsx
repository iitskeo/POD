import { useEffect, useState } from "react";
import { LandingView, effectiveLanding, type LandingConfig, type Product } from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function Catalog() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [config, setConfig] = useState<LandingConfig | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
    api.getLanding().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  if (products === null || config === undefined) {
    return <div className="grid pad">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card skeleton" />)}</div>;
  }

  // Guarantee published products are visible even if the landing is empty or has no grid.
  const effective = effectiveLanding(config, products.length > 0);

  return (
    <LandingView
      config={effective}
      products={products}
      photoUrl={(id) => api.productPhotoUrl(id)}
      imageUrl={(id) => api.uploadUrl(id)}
      onNavigate={navigate}
    />
  );
}
