import { useEffect, useState } from "react";
import { LandingView, DEFAULT_LANDING, type LandingConfig, type Product } from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function Catalog() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [config, setConfig] = useState<LandingConfig | null>(null);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
    api.getLanding().then((r) => setConfig(r.config ?? DEFAULT_LANDING)).catch(() => setConfig(DEFAULT_LANDING));
  }, []);

  if (products === null || config === null) {
    return <div className="grid pad">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card skeleton" />)}</div>;
  }

  return (
    <LandingView
      config={config}
      products={products}
      photoUrl={(id) => api.productPhotoUrl(id)}
      imageUrl={(id) => api.uploadUrl(id)}
      onNavigate={navigate}
    />
  );
}
