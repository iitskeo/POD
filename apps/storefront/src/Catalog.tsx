import { useEffect, useMemo, useState } from "react";
import {
  LandingView, effectiveLanding, composeProductThumbnail, makeResolver, defaultValues,
  type LandingConfig, type Product,
} from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function Catalog() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [config, setConfig] = useState<LandingConfig | null | undefined>(undefined); // undefined = loading
  const [composites, setComposites] = useState<Record<string, string>>({});
  const resolver = useMemo(() => makeResolver(api), []);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
    api.getLanding().then((r) => setConfig(r.config)).catch(() => setConfig(null));
  }, []);

  // For published products without a Printful mockup, render a design-on-garment thumbnail so
  // the card still shows the design (docs/pod/09 §2.2). Products with a mockup use it directly.
  useEffect(() => {
    if (!products) return;
    let stale = false;
    products
      .filter((p) => p.status === "published" && !(p.mockups?.featured?.length) && p.placements.length)
      .forEach(async (p) => {
        try {
          const d = await api.designForProduct(p.id);
          if (stale || !d.elements.length) return;
          const url = await composeProductThumbnail({
            placement: p.placements[0], elements: d.elements, values: defaultValues(d.elements),
            resolver, garmentColor: null, size: 480,
          });
          if (!stale && url) setComposites((m) => ({ ...m, [p.id]: url }));
        } catch { /* fall back to the base photo */ }
      });
    return () => { stale = true; };
  }, [products, resolver]);

  if (products === null || config === undefined) {
    return <div className="grid pad">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card skeleton" />)}</div>;
  }

  const effective = effectiveLanding(config, products.length > 0);
  const cardImage = (p: Product) => p.mockups?.featured?.[0] ?? composites[p.id];

  return (
    <LandingView
      config={effective}
      products={products}
      photoUrl={(id) => api.productPhotoUrl(id)}
      imageUrl={(id) => api.uploadUrl(id)}
      cardImage={cardImage}
      onNavigate={navigate}
    />
  );
}
