import {
  PlacementStage, SEED_ASSETS, makeResolver, minPrice, elementLabel, svgDataUrl,
  renderPrintFilePng,
  type Design, type Element, type GraphicElement, type Placement, type Product,
  type Rect, type SlotValues, type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const FONTS = ["Space Grotesk", "Inter", "IBM Plex Mono", "Arial", "Georgia", "Impact"];
const COLORS = ["#0A0A0A", "#FFFFFF", "#FF5A1F", "#161616", "#F5F5F0", "#1D4ED8", "#DC2626", "#16A34A"];

export function Composer({ productId, onBack }: { productId: string; onBack: () => void }) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [product, setProduct] = useState<Product | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [values, setValues] = useState<SlotValues>({});
  const [active, setActive] = useState("");
  const [variantId, setVariantId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [mockups, setMockups] = useState<string[] | null>(null);
  const [mockupBusy, setMockupBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, d] = await Promise.all([api.product(productId), api.designForProduct(productId).catch(() => null)]);
      setProduct(p);
      setActive(p.placements[0]?.placement ?? "");
      setVariantId(p.externalVariantId ? Number(p.externalVariantId) : p.variants[0]?.id ?? null);
      if (d) { setDesign(d); setElements(d.elements); }
      else setDesign({ id: `design-${productId}`, productId, name: p.name, status: "draft", elements: [] });
    })().catch((e) => setStatus(String(e.message ?? e)));
  }, [productId]);

  // Sample values so text/graphic slots preview complete.
  useEffect(() => {
    const v: SlotValues = {};
    for (const el of elements) if (el.kind === "text" && el.editable) v[el.id] = el.content || "Sample";
    setValues(v);
  }, [elements]);

  // Placements for the chosen garment color (variant_templates override the base).
  const placements: Placement[] = useMemo(() => {
    if (!product) return [];
    const vt = variantId != null ? product.variantTemplates?.[variantId] : null;
    return vt ?? product.placements;
  }, [product, variantId]);
  const placement = placements.find((p) => p.placement === active) ?? placements[0];
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Element>) =>
    setElements((els) => els.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)));
  const remove = (id: string) => { setElements((els) => els.filter((e) => e.id !== id)); setSelectedId(null); };

  const centerRect = (w: number, h: number): Rect => {
    const sp = placement.printSpec;
    return { x: Math.round(sp.widthPx / 2 - w / 2), y: Math.round(sp.heightPx / 2 - h / 2), w, h };
  };
  const nextZ = () => Math.max(0, ...elements.map((e) => e.z)) + 1;

  const addText = () => {
    const sp = placement.printSpec;
    const el: TextElement = {
      id: crypto.randomUUID().slice(0, 8), kind: "text", placement: active,
      rect: centerRect(Math.round(sp.widthPx * 0.7), Math.round(sp.heightPx * 0.15)),
      z: nextZ(), content: "Your text", font: "Space Grotesk", color: "#0A0A0A",
      align: "center", maxLines: 2, minSizeFrac: 0.05, maxChars: 20, editable: false,
    };
    setElements((e) => [...e, el]); setSelectedId(el.id);
  };
  const addGraphic = (assetId: string, aspect: number) => {
    const sp = placement.printSpec;
    const h = Math.round(sp.heightPx * 0.3), w = Math.round(h * aspect);
    const el: GraphicElement = {
      id: crypto.randomUUID().slice(0, 8), kind: "graphic", placement: active,
      rect: centerRect(w, h), z: nextZ(), assetId,
    };
    setElements((e) => [...e, el]); setSelectedId(el.id);
  };
  const addUpload = async (file: File) => {
    setStatus("Uploading…");
    try {
      const { uploadId, aspect } = await api.upload(file);
      const sp = placement.printSpec;
      const h = Math.round(sp.heightPx * 0.4), w = Math.round(h * (aspect || 1));
      const el: Element = {
        id: crypto.randomUUID().slice(0, 8), kind: "image", placement: active,
        rect: centerRect(w, h), z: nextZ(), storageKey: uploadId, aspect: aspect || 1,
      };
      setElements((e) => [...e, el]); setSelectedId(el.id); setStatus("");
    } catch (e) { setStatus(`Upload failed: ${e instanceof Error ? e.message : e}`); }
  };

  const save = async (publish?: boolean) => {
    if (!product) return;
    setStatus("Saving…");
    try {
      const st = publish ? "published" : publish === false ? "draft" : (design?.status ?? "draft");
      await api.saveDesign({ id: `design-${productId}`, productId, name: product.name, status: st, elements });
      if (publish !== undefined) await api.patchProduct(productId, { status: st });
      setStatus(publish ? "Published" : publish === false ? "Unpublished" : "Saved");
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : e}`); }
  };

  const genMockup = async () => {
    if (!product) return;
    setMockupBusy(true); setMockups(null);
    try {
      const files: Array<{ placement: string; printFileUrl: string }> = [];
      for (const pl of placements) {
        if (!elements.some((e) => e.placement === pl.placement)) continue;
        const png = await renderPrintFilePng(pl, elements, values, resolver);
        const key = `preview-${productId}-${pl.placement}-${Date.now()}`;
        const { url } = await api.uploadPrintFile(key, png);
        files.push({ placement: pl.placement, printFileUrl: url });
      }
      if (!files.length) { setStatus("Add art first"); return; }
      setMockups(await api.mockup(productId, files));
    } catch (e) { setStatus(`Mockup failed: ${e instanceof Error ? e.message : e}`); }
    finally { setMockupBusy(false); }
  };

  const priceInput = useRef<HTMLInputElement>(null);

  if (!product || !placement) return <p className="hint pad">Loading…</p>;

  const countFor = (pl: string) => elements.filter((e) => e.placement === pl).length;

  return (
    <div className="composer">
      <div className="composer-bar">
        <button className="btn" onClick={onBack}>← Products</button>
        <strong className="cname">{product.name}</strong>
        <div className="placement-tabs">
          {placements.map((pl) => (
            <button key={pl.placement} data-on={pl.placement === active} onClick={() => { setActive(pl.placement); setSelectedId(null); }}>
              {pl.placement}{countFor(pl.placement) > 0 && <span className="badge">{countFor(pl.placement)}</span>}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <select className="variant" value={variantId ?? ""} onChange={(e) => setVariantId(Number(e.target.value))} title="Garment color">
          {product.variants.filter((v, i, a) => a.findIndex((x) => x.color === v.color) === i).map((v) => (
            <option key={v.id} value={v.id}>{v.color ?? `Variant ${v.id}`}</option>
          ))}
        </select>
        <span className="hint">{status}</span>
        <button className="btn" onClick={() => save()}>Save</button>
        <button className="btn" onClick={genMockup} disabled={mockupBusy}>{mockupBusy ? "Rendering…" : "Mockups"}</button>
        <button className="cta" onClick={() => save(product.status !== "published")}>{product.status === "published" ? "Unpublish" : "Publish"}</button>
      </div>

      <div className="composer-grid">
        <aside className="rail">
          <span className="eyebrow">Add</span>
          <button className="btn wide" onClick={addText}>Text</button>
          <label className="btn wide file">Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && addUpload(e.target.files[0])} /></label>
          <div className="asset-grid">
            {SEED_ASSETS.map((a) => (
              <button key={a.id} className="asset-btn" title={a.name} onClick={() => addGraphic(a.id, a.aspect)}>
                <img src={svgDataUrl(a.svg)} alt={a.name} />
              </button>
            ))}
          </div>

          <span className="eyebrow" style={{ marginTop: 16 }}>Layers</span>
          <ul className="layers">
            {[...elements].filter((e) => e.placement === active).sort((a, b) => b.z - a.z).map((el) => (
              <li key={el.id} data-on={el.id === selectedId}>
                <button className="lname" onClick={() => setSelectedId(el.id)}>{elementLabel(el)}</button>
                <button className="mini" title={el.hidden ? "Show" : "Hide"} onClick={() => update(el.id, { hidden: !el.hidden })}>{el.hidden ? "○" : "●"}</button>
                <button className="mini" title="Delete" onClick={() => remove(el.id)}>×</button>
              </li>
            ))}
            {countFor(active) === 0 && <li className="empty">No elements on this placement</li>}
          </ul>
        </aside>

        <main className="stage-wrap">
          <PlacementStage
            placement={placement} elements={elements} values={values} resolver={resolver}
            mode="author" selectedId={selectedId} onSelect={setSelectedId}
            onChange={(id, rect, rotation) => update(id, { rect, rotation })}
            onRemove={remove}
          />
          <p className="hint">Anything outside the dashed print area is not printed.</p>
          {mockups && (
            <div className="mockups">
              <span className="eyebrow">Realistic mockup</span>
              <div className="mockup-row">{mockups.map((u) => <img key={u} src={u} alt="mockup" />)}</div>
            </div>
          )}
        </main>

        <aside className="props">
          <span className="eyebrow">Properties</span>
          {!selected && <p className="hint">Select an element, or set the price below.</p>}

          {selected?.kind === "text" && <TextProps el={selected} onChange={(patch) => update(selected.id, patch)} />}
          {selected?.kind === "graphic" && <GraphicProps el={selected} onChange={(patch) => update(selected.id, patch)} />}

          <div className="product-props">
            <span className="eyebrow">Product</span>
            <label className="field">
              <span className="hint">Retail price (USD)</span>
              <input ref={priceInput} type="number" step="0.01" defaultValue={(product.retailPriceCents / 100).toFixed(2)}
                onBlur={(e) => api.patchProduct(productId, { retailPriceCents: Math.round(Number(e.target.value) * 100) }).then((p) => setProduct(p))} />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TextProps({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  return (
    <div className="pgroup">
      <label className="field"><span className="hint">Text</span>
        <input value={el.content} onChange={(e) => onChange({ content: e.target.value })} /></label>
      <label className="field"><span className="hint">Font</span>
        <select value={el.font} onChange={(e) => onChange({ font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
      <div className="field"><span className="hint">Color</span>
        <div className="swatches">{COLORS.map((c) => <button key={c} className="sw" data-on={el.color === c} style={{ background: c }} onClick={() => onChange({ color: c })} />)}</div></div>
      <div className="field row">
        <label><span className="hint">Letter spacing</span><input type="number" value={el.letterSpacing ?? 0} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })} /></label>
        <label><span className="hint">Arc °</span><input type="number" value={el.arc ?? 0} onChange={(e) => onChange({ arc: Number(e.target.value) })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={!!el.outline} onChange={(e) => onChange({ outline: e.target.checked ? { color: "#0A0A0A", width: 4 } : undefined })} /> Outline</label>
      <label className="check"><input type="checkbox" checked={!!el.shadow} onChange={(e) => onChange({ shadow: e.target.checked ? { color: "#00000066", blur: 8, dx: 3, dy: 3 } : undefined })} /> Shadow</label>

      <span className="eyebrow" style={{ marginTop: 10 }}>Customer slot</span>
      <label className="check"><input type="checkbox" checked={el.editable} onChange={(e) => onChange({ editable: e.target.checked, textLabel: el.textLabel ?? "Your text" })} /> Editable text</label>
      {el.editable && (
        <div className="field row">
          <label><span className="hint">Label</span><input value={el.textLabel ?? ""} onChange={(e) => onChange({ textLabel: e.target.value })} /></label>
          <label><span className="hint">Max chars</span><input type="number" value={el.maxChars} onChange={(e) => onChange({ maxChars: Number(e.target.value) })} /></label>
        </div>
      )}
    </div>
  );
}

function GraphicProps({ el, onChange }: { el: GraphicElement; onChange: (p: Partial<GraphicElement>) => void }) {
  const opts = SEED_ASSETS.map((a) => a.id);
  return (
    <div className="pgroup">
      <span className="eyebrow" style={{ marginTop: 4 }}>Customer slot</span>
      <label className="check">
        <input type="checkbox" checked={!!el.choiceSlot}
          onChange={(e) => onChange({ choiceSlot: e.target.checked ? { label: "Graphic", options: opts } : undefined })} />
        Let the customer pick the graphic
      </label>
      {el.choiceSlot && <p className="hint">Offering {el.choiceSlot.options.length} graphics.</p>}
    </div>
  );
}
