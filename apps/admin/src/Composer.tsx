import {
  PlacementStage, SEED_ASSETS, makeResolver, elementLabel, svgDataUrl, renderPrintFilePng, alignRect,
  type Align, type Asset, type BackgroundElement, type Design, type Element, type GraphicElement,
  type ImageElement, type PatternElement, type Placement, type Product, type Rect, type SlotValues, type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

const FONTS = ["Space Grotesk", "Inter", "IBM Plex Mono", "Arial", "Georgia", "Impact"];
const COLORS = ["#0A0A0A", "#FFFFFF", "#FF5A1F", "#161616", "#F5F5F0", "#1D4ED8", "#DC2626", "#16A34A"];
const PATTERNS: PatternElement["type"][] = ["half_drop", "block", "brick", "reflect", "line_h", "line_v"];

interface Graphic { id: string; name: string; aspect: number; recolorParts: string[]; thumb: string }

export function Composer({ productId, onBack }: { productId: string; onBack: () => void }) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [product, setProduct] = useState<Product | null>(null);
  const [elements, setElements] = useState<Element[]>([]);
  const [values, setValues] = useState<SlotValues>({});
  const [active, setActive] = useState("");
  const [variantId, setVariantId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [mockups, setMockups] = useState<string[] | null>(null);
  const [mockupBusy, setMockupBusy] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [quick, setQuick] = useState<{ id: string; name: string; elements: Element[] }[]>([]);

  useEffect(() => {
    (async () => {
      const [p, d] = await Promise.all([api.product(productId), api.designForProduct(productId).catch(() => null)]);
      setProduct(p);
      setActive(p.placements[0]?.placement ?? "");
      setVariantId(p.externalVariantId ? Number(p.externalVariantId) : p.variants[0]?.id ?? null);
      if (d) setElements(d.elements);
    })().catch((e) => setStatus(String(e.message ?? e)));
    api.listAssets().then(setAssets).catch(() => {});
    api.listQuickDesigns().then(setQuick).catch(() => {});
  }, [productId]);

  useEffect(() => {
    const v: SlotValues = {};
    for (const el of elements) if (el.kind === "text" && el.editable) v[el.id] = el.content || "Sample";
    setValues(v);
  }, [elements]);

  const graphics: Graphic[] = useMemo(() => [
    ...SEED_ASSETS.map((a) => ({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: a.recolorParts, thumb: svgDataUrl(a.svg) })),
    ...assets.map((a) => ({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: a.recolorParts, thumb: api.assetFileUrl(a.id) })),
  ], [assets]);
  const graphicById = (id: string) => graphics.find((g) => g.id === id);

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
  const uid = () => crypto.randomUUID().slice(0, 8);
  const nextZ = () => Math.max(0, ...elements.map((e) => e.z)) + 1;
  const centerRect = (w: number, h: number): Rect => {
    const sp = placement.printSpec;
    return { x: Math.round(sp.widthPx / 2 - w / 2), y: Math.round(sp.heightPx / 2 - h / 2), w, h };
  };

  const addText = () => {
    const sp = placement.printSpec;
    const el: TextElement = {
      id: uid(), kind: "text", placement: active, rect: centerRect(Math.round(sp.widthPx * 0.7), Math.round(sp.heightPx * 0.15)),
      z: nextZ(), content: "Your text", font: "Space Grotesk", color: "#0A0A0A", align: "center",
      maxLines: 2, minSizeFrac: 0.05, maxChars: 20, editable: false,
    };
    setElements((e) => [...e, el]); setSelectedId(el.id);
  };
  const addGraphic = (g: Graphic) => {
    const sp = placement.printSpec;
    const h = Math.round(sp.heightPx * 0.3), w = Math.round(h * g.aspect);
    const el: GraphicElement = { id: uid(), kind: "graphic", placement: active, rect: centerRect(w, h), z: nextZ(), assetId: g.id };
    setElements((e) => [...e, el]); setSelectedId(el.id);
  };
  const addUpload = async (file: File) => {
    setStatus("Uploading…");
    try {
      const { uploadId, aspect } = await api.upload(file);
      const sp = placement.printSpec;
      const h = Math.round(sp.heightPx * 0.4), w = Math.round(h * (aspect || 1));
      const el: ImageElement = { id: uid(), kind: "image", placement: active, rect: centerRect(w, h), z: nextZ(), storageKey: uploadId, aspect: aspect || 1 };
      setElements((e) => [...e, el]); setSelectedId(el.id); setStatus("");
    } catch (e) { setStatus(`Upload failed: ${e instanceof Error ? e.message : e}`); }
  };
  const addAssetFile = async (file: File) => {
    setStatus("Uploading graphic…");
    try { const a = await api.createAsset(file, file.name.replace(/\.[^.]+$/, "")); setAssets((s) => [a, ...s]); setStatus(""); }
    catch (e) { setStatus(`Failed: ${e instanceof Error ? e.message : e}`); }
  };
  const addBackground = () => {
    const el: BackgroundElement = { id: uid(), kind: "background", placement: active, rect: { x: 0, y: 0, w: placement.printSpec.widthPx, h: placement.printSpec.heightPx }, z: 0, fill: { color: "#FF5A1F" } };
    setElements((e) => [el, ...e.map((x) => ({ ...x, z: x.z + 1 }))]); setSelectedId(el.id);
  };

  // Layers ops
  const reorder = (id: string, dir: -1 | 1) => setElements((els) => {
    const same = els.filter((e) => e.placement === active).sort((a, b) => a.z - b.z);
    const i = same.findIndex((e) => e.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= same.length) return els;
    const zi = same[i].z, zj = same[j].z;
    return els.map((e) => e.id === same[i].id ? { ...e, z: zj } : e.id === same[j].id ? { ...e, z: zi } : e);
  });
  const duplicate = (id: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    const copy = { ...el, id: uid(), z: nextZ(), rect: { ...el.rect, x: el.rect.x + 40, y: el.rect.y + 40 } } as Element;
    setElements((e) => [...e, copy]); setSelectedId(copy.id);
  };
  const duplicateTo = (id: string, target: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    const copy = { ...el, id: uid(), placement: target } as Element;
    setElements((e) => [...e, copy]);
  };

  const align = (a: Align) => {
    if (!selected) return;
    update(selected.id, { rect: alignRect(selected.rect, a, placement.printSpec.widthPx, placement.printSpec.heightPx) });
  };

  const save = async (publish?: boolean) => {
    if (!product) return;
    setStatus("Saving…");
    try {
      const st = publish ? "published" : publish === false ? "draft" : (product.status ?? "draft");
      await api.saveDesign({ id: `design-${productId}`, productId, name: product.name, status: st, elements });
      if (publish !== undefined) { const up = await api.patchProduct(productId, { status: st }); setProduct(up); }
      setStatus(publish ? "Published" : publish === false ? "Unpublished" : "Saved");
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : e}`); }
  };

  const saveQuick = async () => {
    const els = elements.filter((e) => e.placement === active);
    if (!els.length) { setStatus("Nothing on this placement"); return; }
    const name = prompt("Quick design name?") ?? "Quick design";
    try { const qd = await api.createQuickDesign(name, els); setQuick((q) => [qd, ...q]); setStatus("Quick design saved"); }
    catch (e) { setStatus(String((e as Error).message ?? e)); }
  };
  const applyQuick = (qd: { elements: Element[] }) => {
    const cloned = qd.elements.map((e) => ({ ...e, id: uid(), placement: active, z: nextZ() + e.z } as Element));
    setElements((e) => [...e, ...cloned]);
  };

  const genMockup = async () => {
    if (!product) return;
    setMockupBusy(true); setMockups(null);
    try {
      const files = [];
      for (const pl of placements) {
        if (!elements.some((e) => e.placement === pl.placement)) continue;
        const png = await renderPrintFilePng(pl, elements, values, resolver);
        const { url } = await api.uploadPrintFile(`preview-${productId}-${pl.placement}-${Date.now()}`, png);
        files.push({ placement: pl.placement, printFileUrl: url });
      }
      if (!files.length) { setStatus("Add art first"); return; }
      setMockups(await api.mockup(productId, files));
    } catch (e) { setStatus(`Mockup failed: ${e instanceof Error ? e.message : e}`); }
    finally { setMockupBusy(false); }
  };

  if (!product || !placement) return <p className="hint pad">Loading…</p>;
  const countFor = (pl: string) => elements.filter((e) => e.placement === pl).length;
  const otherPlacements = placements.map((p) => p.placement).filter((p) => p !== active);

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
          <label className="btn wide file">Upload image<input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && addUpload(e.target.files[0])} /></label>
          <button className="btn wide" onClick={addBackground}>Background fill</button>

          <div className="row-between"><span className="eyebrow">Graphics</span>
            <label className="mini file" title="Upload a graphic to your library">+<input type="file" accept="image/svg+xml,image/png" hidden onChange={(e) => e.target.files?.[0] && addAssetFile(e.target.files[0])} /></label></div>
          <div className="asset-grid">
            {graphics.map((g) => <button key={g.id} className="asset-btn" title={g.name} onClick={() => addGraphic(g)}><img src={g.thumb} alt={g.name} /></button>)}
          </div>

          <div className="row-between"><span className="eyebrow">Quick designs</span><button className="mini" title="Save this placement as a quick design" onClick={saveQuick}>+</button></div>
          <div className="quick-list">
            {quick.map((qd) => <button key={qd.id} className="btn wide sm" onClick={() => applyQuick(qd)}>{qd.name}</button>)}
            {quick.length === 0 && <p className="hint">None yet</p>}
          </div>

          <span className="eyebrow" style={{ marginTop: 14 }}>Layers</span>
          <ul className="layers">
            {[...elements].filter((e) => e.placement === active).sort((a, b) => b.z - a.z).map((el) => (
              <li key={el.id} data-on={el.id === selectedId}>
                <button className="lname" onClick={() => setSelectedId(el.id)}>{elementLabel(el)}</button>
                <button className="mini" title="Up" onClick={() => reorder(el.id, 1)}>↑</button>
                <button className="mini" title="Down" onClick={() => reorder(el.id, -1)}>↓</button>
                <button className="mini" title={el.locked ? "Unlock" : "Lock"} onClick={() => update(el.id, { locked: !el.locked })}>{el.locked ? "🔒" : "○"}</button>
                <button className="mini" title={el.hidden ? "Show" : "Hide"} onClick={() => update(el.id, { hidden: !el.hidden })}>{el.hidden ? "◌" : "●"}</button>
                <button className="mini" title="Duplicate" onClick={() => duplicate(el.id)}>⎘</button>
                {otherPlacements.length > 0 && (
                  <select className="dupsel" title="Duplicate to placement" value="" onChange={(e) => { if (e.target.value) duplicateTo(el.id, e.target.value); e.target.value = ""; }}>
                    <option value="">→</option>{otherPlacements.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                <button className="mini" title="Delete" onClick={() => remove(el.id)}>×</button>
              </li>
            ))}
            {countFor(active) === 0 && <li className="empty">No elements</li>}
          </ul>
        </aside>

        <main className="stage-wrap">
          {selected && (
            <div className="align-bar">
              <span className="eyebrow">Align</span>
              <button className="mini" title="Left" onClick={() => align("left")}>⬅</button>
              <button className="mini" title="H-center" onClick={() => align("hcenter")}>↔</button>
              <button className="mini" title="Right" onClick={() => align("right")}>➡</button>
              <button className="mini" title="Top" onClick={() => align("top")}>⬆</button>
              <button className="mini" title="V-center" onClick={() => align("vcenter")}>↕</button>
              <button className="mini" title="Bottom" onClick={() => align("bottom")}>⬇</button>
            </div>
          )}
          <PlacementStage placement={placement} elements={elements} values={values} resolver={resolver}
            mode="author" selectedId={selectedId} onSelect={setSelectedId}
            onChange={(id, rect, rotation) => update(id, { rect, rotation })} onRemove={remove} />
          <p className="hint">Anything outside the dashed print area is not printed.</p>
          {mockups && <div className="mockups"><span className="eyebrow">Realistic mockup</span><div className="mockup-row">{mockups.map((u) => <img key={u} src={u} alt="mockup" />)}</div></div>}
        </main>

        <aside className="props">
          <span className="eyebrow">Properties</span>
          {!selected && <p className="hint">Select an element, or set the price below.</p>}
          {selected?.kind === "text" && <TextProps el={selected} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "graphic" && <GraphicProps el={selected} parts={graphicById(selected.assetId)?.recolorParts ?? []} graphics={graphics} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "image" && <ImageProps onPattern={() => {
            const el = selected as ImageElement;
            const pat: PatternElement = { id: el.id, kind: "pattern", placement: el.placement, rect: { x: 0, y: 0, w: placement.printSpec.widthPx, h: placement.printSpec.heightPx }, z: el.z, source: { storageKey: el.storageKey }, type: "half_drop", scale: 1, spacing: 20 };
            update(el.id, pat as unknown as Partial<Element>);
          }} />}
          {selected?.kind === "pattern" && <PatternProps el={selected} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "background" && <BackgroundProps el={selected} graphics={graphics} onChange={(p) => update(selected.id, p)} />}

          <div className="product-props">
            <span className="eyebrow">Product</span>
            <label className="field"><span className="hint">Retail price (USD)</span>
              <input type="number" step="0.01" defaultValue={(product.retailPriceCents / 100).toFixed(2)}
                onBlur={(e) => api.patchProduct(productId, { retailPriceCents: Math.round(Number(e.target.value) * 100) }).then(setProduct)} /></label>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TextProps({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  return (
    <div className="pgroup">
      <label className="field"><span className="hint">Text</span><input value={el.content} onChange={(e) => onChange({ content: e.target.value })} /></label>
      <div className="field row">
        <label><span className="hint">Font</span><select value={el.font} onChange={(e) => onChange({ font: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label><span className="hint">Align</span><select value={el.align} onChange={(e) => onChange({ align: e.target.value as TextElement["align"] })}><option>left</option><option>center</option><option>right</option></select></label>
      </div>
      <div className="field"><span className="hint">Color</span><div className="swatches">{COLORS.map((c) => <button key={c} className="sw" data-on={el.color === c} style={{ background: c }} onClick={() => onChange({ color: c })} />)}</div></div>
      <div className="field row">
        <label><span className="hint">Letter spacing</span><input type="number" value={el.letterSpacing ?? 0} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })} /></label>
        <label><span className="hint">Arc °</span><input type="number" value={el.arc ?? 0} onChange={(e) => onChange({ arc: Number(e.target.value) })} /></label>
        <label><span className="hint">Max lines</span><input type="number" value={el.maxLines} onChange={(e) => onChange({ maxLines: Math.max(1, Number(e.target.value)) })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={!!el.outline} onChange={(e) => onChange({ outline: e.target.checked ? { color: "#0A0A0A", width: 6 } : undefined })} /> Outline</label>
      {el.outline && <div className="field row"><label><span className="hint">Outline color</span><input type="color" value={el.outline.color} onChange={(e) => onChange({ outline: { ...el.outline!, color: e.target.value } })} /></label><label><span className="hint">Width</span><input type="number" value={el.outline.width} onChange={(e) => onChange({ outline: { ...el.outline!, width: Number(e.target.value) } })} /></label></div>}
      <label className="check"><input type="checkbox" checked={!!el.shadow} onChange={(e) => onChange({ shadow: e.target.checked ? { color: "#00000066", blur: 8, dx: 3, dy: 3 } : undefined })} /> Shadow</label>

      <span className="eyebrow" style={{ marginTop: 8 }}>Customer slots</span>
      <label className="check"><input type="checkbox" checked={el.editable} onChange={(e) => onChange({ editable: e.target.checked, textLabel: el.textLabel ?? "Your text" })} /> Editable text</label>
      {el.editable && <div className="field row"><label><span className="hint">Label</span><input value={el.textLabel ?? ""} onChange={(e) => onChange({ textLabel: e.target.value })} /></label><label><span className="hint">Max chars</span><input type="number" value={el.maxChars} onChange={(e) => onChange({ maxChars: Number(e.target.value) })} /></label></div>}
      <label className="check"><input type="checkbox" checked={!!el.colorSlot} onChange={(e) => onChange({ colorSlot: e.target.checked ? { label: "Text color", options: COLORS.slice(0, 4), default: el.color } : undefined })} /> Color choice</label>
    </div>
  );
}

function GraphicProps({ el, parts, graphics, onChange }: { el: GraphicElement; parts: string[]; graphics: Graphic[]; onChange: (p: Partial<GraphicElement>) => void }) {
  return (
    <div className="pgroup">
      <span className="eyebrow" style={{ marginTop: 4 }}>Customer slots</span>
      <label className="check"><input type="checkbox" checked={!!el.choiceSlot} onChange={(e) => onChange({ choiceSlot: e.target.checked ? { label: "Graphic", options: graphics.filter((g) => g.id.startsWith("seed:")).map((g) => g.id) } : undefined })} /> Graphic choice</label>
      {el.choiceSlot && <p className="hint">Offering {el.choiceSlot.options.length} graphics.</p>}
      {parts.length > 0 && (
        <label className="check"><input type="checkbox" checked={!!el.colorSlot} onChange={(e) => onChange({ colorSlot: e.target.checked ? { label: "Color", part: parts[0], options: COLORS.slice(0, 4), default: "#0A0A0A" } : undefined })} /> Color choice ({parts[0]})</label>
      )}
    </div>
  );
}

function ImageProps({ onPattern }: { onPattern: () => void }) {
  return <div className="pgroup"><p className="hint">Uploaded image (owner-only, fixed).</p><button className="btn wide" onClick={onPattern}>Make seamless pattern</button></div>;
}

function PatternProps({ el, onChange }: { el: PatternElement; onChange: (p: Partial<PatternElement>) => void }) {
  return (
    <div className="pgroup">
      <label className="field"><span className="hint">Type</span><select value={el.type} onChange={(e) => onChange({ type: e.target.value as PatternElement["type"] })}>{PATTERNS.map((t) => <option key={t}>{t}</option>)}</select></label>
      <div className="field row"><label><span className="hint">Scale</span><input type="number" step="0.1" value={el.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} /></label><label><span className="hint">Spacing</span><input type="number" value={el.spacing} onChange={(e) => onChange({ spacing: Number(e.target.value) })} /></label></div>
    </div>
  );
}

function BackgroundProps({ el, onChange }: { el: BackgroundElement; graphics: Graphic[]; onChange: (p: Partial<BackgroundElement>) => void }) {
  return (
    <div className="pgroup">
      <div className="field"><span className="hint">Fill color</span><div className="swatches">{COLORS.map((c) => <button key={c} className="sw" data-on={el.fill.color === c} style={{ background: c }} onClick={() => onChange({ fill: { color: c } })} />)}</div></div>
    </div>
  );
}
