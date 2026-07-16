import {
  minPrice,
  type ApiClient,
  type CatalogProduct,
  type Category,
  type PrintfulStatus,
} from "@abbiss/preview-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductDetail } from "./ProductDetail";

interface Props {
  api: ApiClient;
}

const VISIBLE = 48;

/** category -> its root, walking up parent_id. A product hangs off a leaf. */
function rootOf(id: number, byId: Map<number, Category>): number {
  let cur = byId.get(id);
  const seen = new Set<number>();
  while (cur?.parent_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.parent_id);
  }
  return cur?.id ?? id;
}

export function Products({ api }: Props) {
  const [status, setStatus] = useState<PrintfulStatus | null>(null);
  const [items, setItems] = useState<CatalogProduct[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [progress, setProgreso] = useState({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<number | null>(null);
  const [opened, setAbierto] = useState<CatalogProduct | null>(null);

  // Price is not in the listing: it is fetched per product and cached.
  const [prices, setPrecios] = useState<Map<number, number | null>>(new Map());
  const inFlight = useRef(new Set<number>());

  const [notice] = useState<string | null>(() => {
    const p = new URLSearchParams(location.search);
    const v = p.get("printful");
    if (!v) return null;
    history.replaceState({}, "", location.pathname);
    if (v === "conectado") return "Printful connected.";
    if (v === "rechazado") return "You cancelled the connection.";
    return `Printful failed: ${p.get("msg") ?? "error"}`;
  });

  useEffect(() => {
    api.printfulStatus().then(setStatus).catch((e) => setError(String(e.message ?? e)));
  }, [api]);

  useEffect(() => {
    if (!status?.connected) return;
    let cancel = false;
    (async () => {
      try {
        const [cs, all] = await Promise.all([
          api.categories().then((r) => r.data).catch(() => []),
          api.fullCatalog((loaded, total) => !cancel && setProgreso({ loaded, total })),
        ]);
        if (cancel) return;
        setCats(cs);
        // Discontinued products cannot be sold: they never reach the list.
        setItems(all.filter((p) => !p.is_discontinued));
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancel = true; };
  }, [status?.connected, api]);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const roots = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const titleOf = (id: number) => byId.get(id)?.title ?? `Cat. ${id}`;

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items
      .filter((p) => {
        if (catId && rootOf(p.main_category_id, byId) !== catId) return false;
        if (!needle) return true;
        return `${p.name} ${p.brand ?? ""} ${p.model ?? ""} ${p.type}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, q, catId, byId]);

  const onScreen = useMemo(() => filtered.slice(0, VISIBLE), [filtered]);

  /**
   * Fetches prices only for what is on screen, a few at a time.
   *
   * It is 498 products and one call each; fetching them all would burn Printful's
   * rate limit to show 490 prices nobody looks at.
   */
  const fetchPrices = useCallback(
    async (lista: CatalogProduct[]) => {
      const missing = lista.filter((p) => !prices.has(p.id) && !inFlight.current.has(p.id));
      if (!missing.length) return;
      missing.forEach((p) => inFlight.current.add(p.id));

      const POOL = 4;
      for (let i = 0; i < missing.length; i += POOL) {
        const batch = missing.slice(i, i + POOL);
        const res = await Promise.all(
          batch.map((p) =>
            api.productPrices(p.id)
              .then((r) => [p.id, minPrice(r.data)] as const)
              .catch(() => [p.id, null] as const),
          ),
        );
        setPrecios((prev) => {
          const next = new Map(prev);
          for (const [id, v] of res) next.set(id, v);
          return next;
        });
      }
    },
    [api, prices],
  );

  useEffect(() => {
    if (onScreen.length) void fetchPrices(onScreen);
  }, [onScreen, fetchPrices]);

  // Searching jumps to "All": searching "tumbler" inside Accessories returns
  // nothing and reads as a broken search rather than an empty intersection.
  const search = (v: string) => {
    setQ(v);
    if (v.trim()) setCatId(null);
  };

  if (!status) return <p className="hint">Checking connection...</p>;

  if (!status.connected) {
    return (
      <div className="connect-card">
        {notice && <p className="hint" style={{ marginBottom: 12 }}>{notice}</p>}
        <span className="eyebrow">Provider</span>
        <h2 className="connect-title">Connect your Printful store</h2>
        <p className="hint" style={{ maxWidth: "42ch", marginBottom: 16 }}>
          One click and we pull the catalog. The token stays on the server: neither the
          browser nor the code ever sees it.
        </p>
        <a className="cta" href={api.connectUrl()}>Connect Printful</a>
        {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="connect-card">
        <span className="eyebrow">Error</span>
        <h2 className="connect-title">Could not load the catalog</h2>
        <p className="hint">{error}</p>
        <a className="btn" href={api.connectUrl()} style={{ marginTop: 14, display: "inline-block" }}>
          Reconnect Printful
        </a>
      </div>
    );
  }

  if (!items) {
    return (
      <p className="hint">
        Loading catalog... {progress.loaded}
        {progress.total ? ` / ${progress.total}` : ""}
      </p>
    );
  }

  return (
    <div className="catalogo">
      <input
        type="text"
        className="buscador"
        value={q}
        placeholder="Search by name, brand or model..."
        onChange={(e) => search(e.target.value)}
      />

      <div className="chips">
        <button data-on={catId === null} onClick={() => setCatId(null)}>
          All ({items.length})
        </button>
        {roots.map((c) => {
          const n = items.filter((p) => rootOf(p.main_category_id, byId) === c.id).length;
          if (!n) return null;
          return (
            <button key={c.id} data-on={catId === c.id} onClick={() => { setCatId(c.id); setQ(""); }}>
              {c.title} ({n})
            </button>
          );
        })}
      </div>

      <p className="hint">
        {notice ? `${notice} ` : ""}
        {filtered.length} of {items.length} products.
      </p>

      <div className="cat-grid">
        {onScreen.map((p) => {
          const precio = prices.get(p.id);
          return (
            <article className="cat-card" key={p.id}>
              <button className="cat-open" onClick={() => setAbierto(p)} title="Ver detalles">
                <div className="cat-img"><img src={p.image} alt={p.name} /></div>
                <h3>{p.name}</h3>
              </button>
              <p className="hint">
                {p.brand ?? titleOf(rootOf(p.main_category_id, byId))} &middot; {p.variant_count} variants
              </p>
              <p className="precio">
                {precio === undefined ? "..." : precio === null ? "no price" : `from $${precio.toFixed(2)}`}
              </p>
              <div className="cat-actions">
                <button className="btn" onClick={() => setAbierto(p)}>View</button>
                <button className="btn" disabled title="Blocked on the wrapDegrees change">
                  Import
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length > VISIBLE && (
        <p className="hint">Showing {VISIBLE}. Narrow the search to see the rest.</p>
      )}
      {filtered.length === 0 && <p className="hint">Nothing matches that search.</p>}

      {opened && <ProductDetail api={api} product={opened} onClose={() => setAbierto(null)} />}
    </div>
  );
}
