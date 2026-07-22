import { useEffect, useState } from "react";
import type { Product } from "@abbiss/preview-engine";
import { api } from "./api";
import { navigate } from "./App";

export function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null | "missing">(null);

  useEffect(() => {
    api.productBySlug(slug).then(setProduct).catch(() => setProduct("missing"));
  }, [slug]);

  if (product === null) return <p className="hint pad">Loading…</p>;
  if (product === "missing") return <p className="hint pad">Product not found.</p>;

  const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))];
  const colors = [...new Set(product.variants.map((v) => v.color).filter(Boolean))];

  return (
    <div className="pd">
      <div className="pd-gallery">
        {product.hasPhoto ? <img src={api.productPhotoUrl(product.id)} alt={product.name} /> : <div className="ph" />}
      </div>
      <div className="pd-info">
        <h1>{product.name}</h1>
        <span className="mono price big">${(product.retailPriceCents / 100).toFixed(2)}</span>
        <p className="hint">
          {sizes.length > 0 && `Sizes ${sizes[0]}–${sizes[sizes.length - 1]}`}
          {sizes.length > 0 && colors.length > 0 && " · "}
          {colors.length > 0 && `${colors.length} colors`}
        </p>
        <button className="cta" onClick={() => navigate(`/customize/${product.slug}`)}>Customize</button>
      </div>
    </div>
  );
}
