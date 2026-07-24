import { minPrice, Icon, type CatalogProduct, type Product } from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const VISIBLE = 48;

/** Create Products (spec 07 §2): import from Printful + open imported products in the studio. */
export function CreateProducts({ onEdit }: { onEdit: (productId: string) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [mine, setMine] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<number, number | null>>(new Map());
  const [details, setDetails] = useState<Product | null>(null);
  const asked = useRef(new Set<number>());

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("printful")) history.replaceState({}, "", location.pathname);
    api.printfulStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(false));
    api.listProducts().then(setMine).catch(() => {});
  }, []);

  useEffect(() => {
    if (connected) api.fullCatalog().then(setCatalog).catch((e) => setError(String(e.message ?? e)));
  }, [connected]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const n = q.trim().toLowerCase();
    return catalog
      .filter((p) => !p.is_discontinued)
      .filter((p) => !n || `${p.name} ${p.brand ?? ""} ${p.model ?? ""}`.toLowerCase().includes(n))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, q]);

  const shown = filtered.slice(0, VISIBLE);
  useEffect(() => {
    shown.forEach((p) => {
      if (asked.current.has(p.id)) return;
      asked.current.add(p.id);
      api.catalogPrices(p.id)
        .then((r) => setPrices((m) => new Map(m).set(p.id, minPrice(r.data))))
        .catch(() => setPrices((m) => new Map(m).set(p.id, null)));
    });
  }, [shown]);

  const doImport = async (id: number) => {
    setImporting(id);
    setError(null);
    try {
      const { productId } = await api.import(id);
      onEdit(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImporting(null);
    }
  };

  if (connected === null) return <p className="hint pad">Checking Printful…</p>;

  if (!connected) {
    return (
      <div className="connect">
        <span className="eyebrow">Provider</span>
        <h2>Connect your Printful store</h2>
        <p className="hint">One click and we pull the catalog. The token stays on the server.</p>
        <a className="cta" href={api.connectUrl()}>Connect Printful</a>
      </div>
    );
  }

  return (
    <div className="products pad">
      <h1 className="page-title">Create Products</h1>

      {mine.length > 0 && (
        <section className="mine">
          <span className="eyebrow">Your imported products</span>
          <div className="mine-grid">
            {mine.map((p) => (
              <button key={p.id} className="mine-card" onClick={() => setDetails(p)}>
                {p.hasPhoto && <img src={api.productPhotoUrl(p.id)} alt="" />}
                <div>
                  <div className="mine-name">{p.name}</div>
                  <span className="mono status" data-published={p.status === "published"}>{p.status}</span>
                </div>
                <Icon name="search" size={15} className="mine-chevron" />
              </button>
            ))}
          </div>
        </section>
      )}

      <span className="eyebrow" style={{ marginTop: 20 }}>Import from Printful</span>
      <input className="search" placeholder="Search by name, brand or model…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="hint warn">{error}</p>}
      {!catalog ? (
        <p className="hint">Loading catalog…</p>
      ) : (
        <>
          <p className="hint">{filtered.length} products</p>
          <div className="cat-grid">
            {shown.map((p) => {
              const price = prices.get(p.id);
              return (
                <article className="cat-card" key={p.id}>
                  <div className="cat-img"><img src={p.image} alt={p.name} /></div>
                  <h3>{p.name}</h3>
                  <p className="hint">{p.brand ?? "Printful"} · {price === undefined ? "…" : price === null ? "—" : `from $${price.toFixed(2)}`}</p>
                  <button className="cta wide" disabled={importing !== null} onClick={() => doImport(p.id)}>
                    {importing === p.id ? "Importing…" : "Import & Design"}
                  </button>
                </article>
              );
            })}
          </div>
          {filtered.length > VISIBLE && <p className="hint">Showing {VISIBLE}. Narrow the search.</p>}
        </>
      )}

      {details && <ProductDetailsModal product={details} onClose={() => setDetails(null)} onDesign={() => { const id = details.id; setDetails(null); onEdit(id); }} />}
    </div>
  );
}

/** Read-only product details: photo, price, techniques, description and materials. */
function ProductDetailsModal({ product, onClose, onDesign }: { product: Product; onClose: () => void; onDesign: () => void }) {
  const colors = product.variants.filter((v, i, a) => a.findIndex((x) => x.color === v.color) === i).map((v) => v.color).filter(Boolean);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{product.name}</strong>
          <button className="mini" title="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="detail-body">
          {product.hasPhoto && <img className="detail-photo" src={api.productPhotoUrl(product.id)} alt="" />}
          <div className="detail-info">
            <div className="detail-row"><span className="hint">Status</span><span className="mono status" data-published={product.status === "published"}>{product.status}</span></div>
            <div className="detail-row"><span className="hint">Base price</span><span>{product.basePriceCents ? `$${(product.basePriceCents / 100).toFixed(2)} ${product.currency}` : "—"}</span></div>
            <div className="detail-row"><span className="hint">Retail price</span><span>{product.retailPriceCents ? `$${(product.retailPriceCents / 100).toFixed(2)}` : "not set"}</span></div>
            <div className="detail-row"><span className="hint">Techniques</span><span>{product.techniques.length ? product.techniques.join(", ") : "—"}</span></div>
            <div className="detail-row"><span className="hint">Colors</span><span>{colors.length} variants</span></div>
          </div>
        </div>
        <div className="detail-block"><span className="eyebrow">Materials</span><p className="hint">{product.materials || "Not provided by Printful for this product."}</p></div>
        <div className="detail-block"><span className="eyebrow">Description</span><p className="hint">{product.description || "No description available."}</p></div>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="cta" onClick={onDesign}>Design this product</button>
        </div>
      </div>
    </div>
  );
}
