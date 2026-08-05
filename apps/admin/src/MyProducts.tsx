import {
  defaultValues, makeResolver, renderPrintFilePng, Icon, type Product,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

/** My Products (spec 07 §9): price, publish/unpublish, and mockup selection at publish. */
export function MyProducts({ onDesign }: { onDesign: (productId: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState("");
  const [publishing, setPublishing] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

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

  const onUpdated = (up: Product) => setProducts((ps) => ps.map((x) => (x.id === up.id ? up : x)));

  const remove = async (p: Product) => {
    try {
      await api.deleteProduct(p.id);
      setProducts((ps) => ps.filter((x) => x.id !== p.id));
    } catch (e) { setStatus(String((e as Error).message ?? e)); }
    setDeleting(null);
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
              <span className="hint">Base cost</span>
              <input type="text" readOnly className="ro" title="Printful base price (not editable)"
                value={p.basePriceCents ? `$${(p.basePriceCents / 100).toFixed(2)}` : "—"} />
            </label>
            <label className="price-field">
              <span className="hint">Retail (USD)</span>
              <input type="number" step="0.01" defaultValue={(p.retailPriceCents / 100).toFixed(2)}
                onBlur={(e) => setPrice(p.id, Number(e.target.value))} />
            </label>
            <div className="price-field margin-field">
              <span className="hint">Margin</span>
              {(() => {
                const m = p.retailPriceCents - p.basePriceCents;
                const pct = p.basePriceCents > 0 ? Math.round((m / p.basePriceCents) * 100) : null;
                return (
                  <span className="margin" data-sign={m > 0 ? "pos" : m < 0 ? "neg" : "zero"}
                    title="Retail minus Printful base cost">
                    {p.basePriceCents ? `$${(m / 100).toFixed(2)}${pct !== null ? ` · ${pct}%` : ""}` : "—"}
                  </span>
                );
              })()}
            </div>
            <div className="spacer" />
            <button className="btn" onClick={() => setEditing(p)}>Edit</button>
            <button className="btn" onClick={() => onDesign(p.id)}>Design</button>
            {p.status === "published"
              ? <>
                  <button className="btn" onClick={() => setPublishing(p)}>Mockups</button>
                  <button className="btn" onClick={() => unpublish(p)}>Unpublish</button>
                </>
              : <>
                  <button className="cta" onClick={() => setPublishing(p)}>Publish</button>
                  <button className="btn danger" title="Delete" onClick={() => setDeleting(p)}><Icon name="trash" size={16} /></button>
                </>}
          </div>
        ))}
      </div>

      {publishing && <PublishModal product={publishing} onClose={() => setPublishing(null)} onUpdated={onUpdated} />}
      {editing && <ProductEditModal product={editing} onClose={() => setEditing(null)}
        onSaved={(up) => { setProducts((ps) => ps.map((x) => (x.id === up.id ? up : x))); setEditing(null); }} />}
      {deleting && (
        <div className="modal-backdrop" onClick={() => setDeleting(null)}>
          <div className="modal sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Delete product</strong>
              <button className="mini" title="Close" onClick={() => setDeleting(null)}><Icon name="x" size={16} /></button>
            </div>
            <p className="hint">Delete "{deleting.name}"? This removes the product, its design and its photos. Existing orders keep their saved copy. This can't be undone.</p>
            <div className="modal-actions">
              <div className="spacer" />
              <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="cta danger" onClick={() => remove(deleting)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Edit product name, description and materials (defaults come from Printful). */
function ProductEditModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (p: Product) => void }) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [materials, setMaterials] = useState(product.materials ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const up = await api.patchProduct(product.id, { name: name.trim() || product.name, description: description.trim() || null, materials: materials.trim() || null });
      onSaved(up);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Edit · {product.name}</strong>
          <button className="mini" title="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        {err && <p className="hint warn">{err}</p>}
        <label className="field"><span className="hint">Product name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span className="hint">Materials (leave blank to use the Printful default)</span>
          <input value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="e.g. 100% Cotton" /></label>
        <label className="field"><span className="hint">Description (leave blank to use the Printful default)</span>
          <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="cta" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fast publish: generate the main colour's mockup (single variant, like Printful's own page),
 * publish immediately, then fill the other offered colours' previews in the background — one
 * small task per colour, persisted as each lands. Closing the modal stops the background fill;
 * missing colours fall back to the real product photo and can be regenerated via "Mockups".
 */
function PublishModal({ product, onClose, onUpdated }: {
  product: Product; onClose: () => void; onUpdated: (p: Product) => void;
}) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [phase, setPhase] = useState<"main" | "colors" | "done" | "error">("main");
  const [elapsed, setElapsed] = useState(0);
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [colorCount, setColorCount] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const published = useRef(false);

  useEffect(() => {
    let stop = false;
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    (async () => {
      try {
        // Render the design's print files once (the Worker can't render canvas).
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
        if (!files.length) { if (!stop) { setError("Add art in the studio before publishing."); setPhase("error"); } return; }

        // One representative variant per offered colour, in Printful's order (first = main).
        const offered = product.offeredVariantColors;
        const colorVariant = new Map<string, number>();
        for (const v of product.variants) {
          if (v.color && (!offered || offered.includes(v.color)) && !colorVariant.has(v.color)) colorVariant.set(v.color, v.id);
        }
        const entries = [...colorVariant.entries()];
        if (!entries.length) { if (!stop) { setError("This product has no colour to mock up."); setPhase("error"); } return; }
        const [mainColor, mainVariant] = entries[0];

        // 1) Main mockup — a single variant renders fast — then publish right away.
        const main = await api.mockup(product.id, files, [mainVariant]);
        if (stop) return;
        const mUrl = main[0]?.url ?? null;
        setMainUrl(mUrl);
        const byColor: Record<string, string> = mUrl ? { [mainColor]: mUrl } : {};
        const up = await api.patchProduct(product.id, {
          status: "published",
          mockups: { generated: mUrl ? [mUrl] : [], featured: mUrl ? [mUrl] : [], byColor: { ...byColor } },
        });
        published.current = true;
        if (!stop) onUpdated(up);

        // 2) Remaining colours in the background — one task each, saved as they complete.
        const rest = entries.slice(1);
        if (!rest.length) { if (!stop) setPhase("done"); return; }
        if (!stop) { setPhase("colors"); setColorCount({ done: 0, total: rest.length }); }
        for (const [color, variantId] of rest) {
          if (stop) break;
          try {
            const r = await api.mockup(product.id, files, [variantId]);
            const u = r.find((x) => x.variantId === variantId)?.url ?? r[0]?.url;
            if (u) {
              byColor[color] = u;
              const generated = Object.values(byColor);
              const up2 = await api.patchProduct(product.id, {
                mockups: { generated, featured: mUrl ? [mUrl] : generated.slice(0, 1), byColor: { ...byColor } },
              });
              if (!stop) onUpdated(up2);
            }
          } catch { /* skip a colour Printful can't render; the product photo covers it */ }
          if (!stop) setColorCount((c) => ({ ...c, done: c.done + 1 }));
        }
        if (!stop) setPhase("done");
      } catch (e) {
        if (!stop) { setError(e instanceof Error ? e.message : String(e)); setPhase(published.current ? "done" : "error"); }
      } finally { clearInterval(tick); }
    })();
    return () => { stop = true; clearInterval(tick); };
  }, [product.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape hatch: publish now with no mockups (a slow/unsupported product never blocks the owner).
  const publishWithout = async () => {
    setError("");
    try { onUpdated(await api.patchProduct(product.id, { status: "published" })); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const retry = () => { setError(""); setMainUrl(null); setElapsed(0); setPhase("main"); setAttempt((a) => a + 1); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>Publish · {product.name}</strong>
          <button className="mini" title="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {error && <p className="hint warn">{error}</p>}

        {phase === "main" && !error && (
          <>
            <p className="hint">Generating the main mockup with Printful… {elapsed}s</p>
            <div className="modal-actions">
              <div className="spacer" />
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn" onClick={publishWithout}>Publish without mockups</button>
            </div>
          </>
        )}

        {phase === "error" && (
          <div className="modal-actions">
            <div className="spacer" />
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={retry}>Retry</button>
            <button className="cta" onClick={publishWithout}>Publish without mockups</button>
          </div>
        )}

        {(phase === "colors" || phase === "done") && (
          <>
            {mainUrl && <div className="mockup-pick"><div className="mk-tile on"><img src={mainUrl} alt="main mockup" /></div></div>}
            <p className="hint">
              Published{mainUrl ? "" : " (no mockup yet)"}.{" "}
              {phase === "colors"
                ? `Generating colour previews… ${colorCount.done}/${colorCount.total}. Keep this open to finish them.`
                : "Colour previews ready."}
            </p>
            <div className="modal-actions">
              <div className="spacer" />
              <button className={phase === "done" ? "cta" : "btn"} onClick={onClose}>
                {phase === "done" ? "Done" : "Close"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
