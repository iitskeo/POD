import { minPrice, type CatalogProduct, type Product } from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const VISIBLE = 48;

export function Products({ onEdit }: { onEdit: (productId: string) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [mine, setMine] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Map<number, number | null>>(new Map());
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
      {mine.length > 0 && (
        <section className="mine">
          <span className="eyebrow">Your products</span>
          <div className="mine-grid">
            {mine.map((p) => (
              <button key={p.id} className="mine-card" onClick={() => onEdit(p.id)}>
                {p.hasPhoto && <img src={api.productPhotoUrl(p.id)} alt="" />}
                <div>
                  <div className="mine-name">{p.name}</div>
                  <span className="mono status" data-published={p.status === "published"}>{p.status}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <span className="eyebrow" style={{ marginTop: 20 }}>Printful catalog</span>
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
    </div>
  );
}
