import {
  minPrice,
  type ApiClient,
  type CatalogDetail,
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

function unwrap<T>(x: { data?: T } | T | { error: string }): T | null {
  if (!x) return null;
  if (typeof x === "object" && "error" in (x as object)) return null;
  const o = x as { data?: T };
  return (o.data ?? (x as T)) ?? null;
}

export function Detalle({ api, product, onClose }: Props) {
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [prices, setPrices] = useState<ProductPrices | null>(null);
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
      api.productPrices(product.id).then((r) => r.data).catch(() => null),
    ])
      .then(([d, p]) => {
        if (cancel) return;
        setDetail(d);
        setPrices(p);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : String(e)));
    return () => { cancel = true; };
  }, [api, product.id]);

  const variants = detail ? unwrap<CatalogVariant[]>(detail.variants) ?? [] : [];
  const styles = detail ? unwrap<MockupStyle[]>(detail.styles) ?? [] : [];
  const printFile = styles.find((s) => s.placement === "default") ?? styles[0];
  const desde = prices ? minPrice(prices) : null;
  const precioDe = (id: number) => {
    const v = prices?.variants.find((x) => x.id === id);
    return v?.techniques[0]?.price ?? null;
  };

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
          <button className="mini" onClick={onClose} aria-label="Cerrar">x</button>
        </header>

        <div className="modal-body">
          <div className="modal-col">
            <div className="cat-img"><img src={product.image} alt={product.name} /></div>
            {desde !== null && (
              <p className="precio-grande">
                desde ${desde.toFixed(2)}{" "}
                <span className="hint" style={{ display: "inline" }}>{prices?.currency}</span>
              </p>
            )}
            <button className="cta wide" disabled title="Falta el cambio a wrapDegrees">
              Importar producto
            </button>
            <p className="hint">
              El import se habilita al cambiar wraps360 por wrapDegrees: este producto no
              envuelve 360 grados y se mapearia mal.
            </p>
          </div>

          <div className="modal-col">
            {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}
            {!detail && !error && <p className="hint">Cargando detalles...</p>}

            {printFile && (
              <>
                <span className="eyebrow">Area de impresion</span>
                <table className="tabla">
                  <tbody>
                    <tr>
                      <td>Medidas</td>
                      <td>
                        {/* Printful devuelve fracciones como 10.583333333333334. */}
                        {printFile.print_area_width.toFixed(2)} x{" "}
                        {printFile.print_area_height.toFixed(2)} in
                      </td>
                    </tr>
                    <tr>
                      <td>A {printFile.dpi} dpi</td>
                      <td>
                        {Math.round(printFile.print_area_width * printFile.dpi)} x{" "}
                        {Math.round(printFile.print_area_height * printFile.dpi)} px
                      </td>
                    </tr>
                    <tr><td>Tecnica</td><td>{printFile.technique}</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {product.description && (
              <>
                <span className="eyebrow" style={{ marginTop: 14 }}>Descripcion</span>
                <p className="hint desc">{product.description.slice(0, 420)}</p>
              </>
            )}

            {variants.length > 0 && (
              <>
                <span className="eyebrow" style={{ marginTop: 14 }}>
                  Variantes ({product.variant_count})
                </span>
                <table className="tabla">
                  <thead>
                    <tr><th>Variante</th><th>Talla</th><th>Color</th><th>Precio</th></tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id}>
                        <td>{v.name}</td>
                        <td>{v.size ?? "-"}</td>
                        <td>
                          {v.color_code && (
                            <span className="dot" style={{ background: v.color_code }} />
                          )}
                          {v.color ?? "-"}
                        </td>
                        <td>{precioDe(v.id) ? `$${precioDe(v.id)}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {product.variant_count > variants.length && (
                  <p className="hint">
                    Mostrando {variants.length} de {product.variant_count}.
                  </p>
                )}
              </>
            )}

            {prices?.discount_tiers?.length ? (
              <>
                <span className="eyebrow" style={{ marginTop: 14 }}>Descuento por volumen</span>
                <p className="hint">
                  {prices.discount_tiers
                    .map((t) => `${t.quantity}+ = -${Math.round(t.bulk_discount_percentage * 100)}%`)
                    .join("  ·  ")}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
