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
  const offered = product.offeredVariantColors;
  const colors = ([...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[])
    .filter((c) => !offered || offered.includes(c));
  // Owner-curated mockups (main first) are the gallery; fall back to the product photo.
  const featured = product.mockups?.featured ?? [];

  return (
    <div className="pd">
      <div className="pd-gallery">
        {featured.length > 0 ? (
          featured.map((url, i) => <img key={url} src={url} alt={`${product.name} ${i + 1}`} data-main={i === 0} />)
        ) : product.hasPhoto ? (
          <img src={api.productPhotoUrl(product.id)} alt={product.name} />
        ) : <div className="ph" />}
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
