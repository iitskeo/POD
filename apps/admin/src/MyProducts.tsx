import {
  defaultValues, makeResolver, renderPrintFilePng, Icon, type Product,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const MAX_MOCKUPS = 5;

/** My Products (spec 07 §9): price, publish/unpublish, and mockup selection at publish. */
export function MyProducts({ onDesign }: { onDesign: (productId: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState("");
  const [publishing, setPublishing] = useState<Product | null>(null);

  const load = () => api.listProducts().then(setProducts).catch((e) => setStatus(String(e.message ?? e)));
  useEffect(() => { load(); }, []);

  const setPrice = async (id: string, dollars: number) => {
    try {
      const up = await api.patchProduct(id, { retailPriceCents: Math.round(dollars * 100) });
      setProducts((ps) => ps.map((p) => (p.id === id ? up : p)));
    } catch (e) { setStatus(String((e as Error).message ?? e)); }
  };

  const unpublish = async (p: Product) => {
    const up = await api.patchProduct(p.id, { status: "draft" });
    setProducts((ps) => ps.map((x) => (x.id === p.id ? up : x)));
  };

  const onPublished = (up: Product) => {
    setProducts((ps) => ps.map((x) => (x.id === up.id ? up : x)));
    setPublishing(null);
  };

  return (
    <div className="products pad">
      <h1 className="page-title">My Products</h1>
      {status && <p className="hint warn">{status}</p>}
      {products.length === 0 && <p className="hint">No products yet. Import one from Create Products.</p>}

      <div className="rows">
        {products.map((p) => (
          <div className="prod-row" key={p.id}>
            {p.hasPhoto ? <img className="prod-thumb" src={api.productPhotoUrl(p.id)} alt="" /> : <div className="prod-thumb" />}
            <div className="prod-main">
              <div className="prod-name">{p.name}</div>
              <span className="mono status" data-published={p.status === "published"}>{p.status}</span>
            </div>
            <label className="price-field">
              <span className="hint">Retail (USD)</span>
              <input type="number" step="0.01" defaultValue={(p.retailPriceCents / 100).toFixed(2)}
                onBlur={(e) => setPrice(p.id, Number(e.target.value))} />
            </label>
            <button className="btn" onClick={() => onDesign(p.id)}>Design</button>
            {p.status === "published"
              ? <button className="btn" onClick={() => unpublish(p)}>Unpublish</button>
              : <button className="cta" onClick={() => setPublishing(p)}>Publish</button>}
          </div>
        ))}
      </div>

      {publishing && <PublishModal product={publishing} onClose={() => setPublishing(null)} onPublished={onPublished} />}
    </div>
  );
}

/** Generate mockups, then an Instagram-style ordered pick (first = main). */
function PublishModal({ product, onClose, onPublished }: {
  product: Product; onClose: () => void; onPublished: (p: Product) => void;
}) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [phase, setPhase] = useState<"gen" | "pick" | "saving">("gen");
  const [elapsed, setElapsed] = useState(0);
  const [generated, setGenerated] = useState<string[]>([]);
  const [featured, setFeatured] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    (async () => {
      try {
        const design = await api.designForProduct(product.id).catch(() => null);
        const elements = design?.elements ?? [];
        const values = defaultValues(elements);
        const files: Array<{ placement: string; printFileUrl: string }> = [];
        for (const pl of product.placements) {
          if (!elements.some((e) => e.placement === pl.placement)) continue;
          const png = await renderPrintFilePng(pl, elements, values, resolver);
          const { url } = await api.uploadPrintFile(`pub-${product.id}-${pl.placement}-${Date.now()}`, png);
          files.push({ placement: pl.placement, printFileUrl: url });
        }
        if (!files.length) { if (!stop) { setError("Add art in the studio before publishing."); } return; }
        const urls = await api.mockup(product.id, files);
        if (stop) return;
        const capped = urls.slice(0, MAX_MOCKUPS);
        setGenerated(capped);
        setFeatured(capped.slice(0, 1)); // default: first is the main image
        setPhase("pick");
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      } finally { clearInterval(tick); }
    })();
    return () => { stop = true; clearInterval(tick); };
  }, [product.id]);

  const toggle = (url: string) => {
    setFeatured((f) => f.includes(url) ? f.filter((u) => u !== url) : (f.length < MAX_MOCKUPS ? [...f, url] : f));
  };
  const rank = (url: string) => featured.indexOf(url);

  const confirm = async () => {
    setPhase("saving");
    try {
      const up = await api.patchProduct(product.id, {
        status: "published",
        mockups: { generated, featured: featured.length ? featured : generated.slice(0, 1) },
      });
      onPublished(up);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase("pick"); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Publish · {product.name}</strong>
          <button className="mini" title="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {error && <p className="hint warn">{error}</p>}

        {phase === "gen" && !error && (
          <p className="hint">Generating realistic mockups with Printful… {elapsed}s</p>
        )}

        {phase !== "gen" && generated.length > 0 && (
          <>
            <p className="hint">Click mockups to feature them, in order. The first is the main image. Pick 1–{MAX_MOCKUPS}.</p>
            <div className="mockup-pick">
              {generated.map((url) => {
                const r = rank(url);
                return (
                  <button key={url} className={`mk-tile${r >= 0 ? " on" : ""}`} onClick={() => toggle(url)}>
                    <img src={url} alt="mockup" />
                    {r >= 0 && <span className="mk-num" data-main={r === 0}>{r + 1}</span>}
                  </button>
                );
              })}
            </div>
            <div className="modal-actions">
              <span className="hint">{featured.length} selected{featured.length ? ` · main: #${rank(featured[0]) + 1}` : ""}</span>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="cta" disabled={phase === "saving" || featured.length === 0} onClick={confirm}>
                {phase === "saving" ? "Publishing…" : "Publish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
