import {
  minPrice,
  type ApiClient,
  type CatalogProduct,
  type CatalogVariant,
  type MockupStyle,
  type ProductPrices,
} from "@abbiss/preview-engine";
import { useEffect, useState } from "react";

interface Props {
  api: ApiClient;
  product: CatalogProduct;
  onClose: () => void;
}

function unwrap<T>(x: { data?: T } | T | { error: string } | undefined): T | null {
  if (!x) return null;
  if (typeof x === "object" && "error" in (x as object)) return null;
  const o = x as { data?: T };
  return (o.data ?? (x as T)) ?? null;
}

export function ProductDetail({ api, product, onClose }: Props) {
  const [styles, setStyles] = useState<MockupStyle[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[] | null>(null);
  const [prices, setPrices] = useState<ProductPrices | null>(null);
  const [selected, setSelected] = useState<CatalogVariant | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api.catalogProduct(product.id),
      api.allVariants(product.id, product.variant_count).catch(() => []),
      api.productPrices(product.id).then((r) => r.data).catch(() => null),
    ])
      .then(([d, vs, p]) => {
        if (cancel) return;
        setStyles(unwrap<MockupStyle[]>(d.styles) ?? []);
        setVariants(vs);
        setPrices(p);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : String(e)));
    return () => { cancel = true; };
  }, [api, product.id, product.variant_count]);

  const printFile = styles.find((s) => s.placement === "default") ?? styles[0];
  const from = prices ? minPrice(prices) : null;
  const priceOf = (id: number) =>
    prices?.variants.find((v) => v.id === id)?.techniques[0]?.price ?? null;

  // The picked variant drives the image, so you see what you are importing.
  const image = selected?.image ?? product.image;
  const shown = selected ? priceOf(selected.id) : null;

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={product.name}>
        <header className="modal-head">
          <div>
            <span className="eyebrow">{product.brand ?? "Printful"} &middot; #{product.id}</span>
            <h2 className="connect-title" style={{ fontSize: 20, margin: "4px 0 0" }}>
              {product.name}
            </h2>
          </div>
          <button className="mini" onClick={onClose} aria-label="Close">x</button>
        </header>

        <div className="modal-body">
          <div className="modal-col">
            <div className="cat-img">
              <img src={image} alt={selected?.name ?? product.name} />
            </div>
            <p className="caption">{selected ? selected.name : "Default image"}</p>

            <p className="precio-grande">
              {shown ? `$${shown}` : from !== null ? `from $${from.toFixed(2)}` : "—"}{" "}
              <span className="hint" style={{ display: "inline" }}>{prices?.currency ?? ""}</span>
            </p>

            <button className="cta wide" disabled title="Blocked on the wrapDegrees change">
              Import product
            </button>
            <p className="hint">
              Import unlocks once wraps360 becomes wrapDegrees: this product does not wrap
              a full 360&deg; and would map incorrectly.
            </p>
          </div>

          <div className="modal-col">
            {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}

            {printFile && (
              <>
                <span className="eyebrow">Print area</span>
                <table className="tabla">
                  <tbody>
                    <tr>
                      <td>Size</td>
                      <td>
                        {/* Printful returns fractions like 10.583333333333334. */}
                        {printFile.print_area_width.toFixed(2)} &times;{" "}
                        {printFile.print_area_height.toFixed(2)} in
                      </td>
                    </tr>
                    <tr>
                      <td>At {printFile.dpi} dpi</td>
                      <td>
                        {Math.round(printFile.print_area_width * printFile.dpi)} &times;{" "}
                        {Math.round(printFile.print_area_height * printFile.dpi)} px
                      </td>
                    </tr>
                    <tr><td>Technique</td><td>{printFile.technique}</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {product.description && (
              <>
                <span className="eyebrow" style={{ marginTop: 14 }}>Description</span>
                <p className="hint desc">{product.description.slice(0, 420)}</p>
              </>
            )}

            <span className="eyebrow" style={{ marginTop: 14 }}>
              Variants{variants ? ` (${variants.length})` : ""}
            </span>
            {!variants && <p className="hint">Loading variants...</p>}
            {variants && (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr><th>Variant</th><th>Size</th><th>Color</th><th>Price</th></tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr
                        key={v.id}
                        className="fila-click"
                        data-on={selected?.id === v.id}
                        onClick={() => setSelected(selected?.id === v.id ? null : v)}
                      >
                        <td>{v.name}</td>
                        <td>{v.size ?? "-"}</td>
                        <td>
                          {v.color_code && (
                            <span className="dot" style={{ background: v.color_code }} />
                          )}
                          {v.color ?? "-"}
                        </td>
                        <td>{priceOf(v.id) ? `$${priceOf(v.id)}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint">Click a variant to preview its image.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
