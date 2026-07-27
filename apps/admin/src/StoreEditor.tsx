import { useEffect, useRef, useState } from "react";
import {
  LandingView, DEFAULT_LANDING, newSection, Icon,
  type LandingConfig, type LandingSection, type LandingSectionType, type Product,
} from "@abbiss/preview-engine";
import { api } from "./api";

const STOREFRONT = import.meta.env.VITE_STOREFRONT_BASE ?? "http://localhost:5173";

/** My Store — inline WYSIWYG landing editor (docs/pod/08). Edits the draft; Publish goes live. */
export function StoreEditor() {
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [save, setSave] = useState<"" | "saving" | "saved">("");
  const [unpublished, setUnpublished] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => {});
    api.getLanding().then((r) => setConfig(r.config ?? DEFAULT_LANDING)).catch(() => setConfig(DEFAULT_LANDING));
  }, []);

  const scheduleSave = (next: LandingConfig) => {
    setUnpublished(true);
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await api.saveLanding(next); setSave("saved"); } catch { setSave(""); }
    }, 700);
  };

  const apply = (fn: (sections: LandingSection[]) => LandingSection[]) =>
    setConfig((c) => {
      if (!c) return c;
      const next = { ...c, sections: fn(c.sections) };
      scheduleSave(next);
      return next;
    });

  const patchSection = (id: string, patch: Record<string, unknown>) =>
    apply((secs) => secs.map((s) => (s.id === id ? ({ ...s, ...patch } as LandingSection) : s)));

  const onText = (id: string, patch: Record<string, string>) =>
    apply((secs) => secs.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s } as Record<string, unknown> & { cta?: { label: string; target: string } };
      for (const [k, v] of Object.entries(patch)) {
        if (k === "cta.label" && next.cta) next.cta = { ...next.cta, label: v };
        else next[k] = v;
      }
      return next as unknown as LandingSection;
    }));

  const onMove = (id: string, dir: -1 | 1) => apply((secs) => {
    const i = secs.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= secs.length) return secs;
    const copy = secs.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const onRemove = (id: string) => {
    apply((secs) => secs.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onAdd = (afterId: string, type: LandingSectionType) => {
    const s = newSection(type);
    apply((secs) => { const i = secs.findIndex((x) => x.id === afterId); const c = secs.slice(); c.splice(i + 1, 0, s); return c; });
    setSelectedId(s.id);
  };

  const publish = async () => { try { await api.publishLanding(); setUnpublished(false); } catch { /* keep dirty */ } };

  if (!config) return <div className="pad"><div className="sk sk-stage" /></div>;

  return (
    <div className="store-editor">
      <div className="se-bar">
        <strong className="cname">My Store</strong>
        <span className="save-state mono" data-s={save}>{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}</span>
        <div className="spacer" />
        {unpublished && <span className="se-dot" title="Unpublished changes" />}
        <a className="btn ghost" href={STOREFRONT} target="_blank" rel="noreferrer">View live <Icon name="external-link" size={14} /></a>
        <button className="cta" onClick={publish}>Publish</button>
      </div>
      <div className="se-canvas">
        <LandingView
          config={config}
          products={products}
          photoUrl={(id) => api.productPhotoUrl(id)}
          imageUrl={(id) => api.uploadUrl(id)}
          edit={{
            selectedId, onSelect: setSelectedId, onText, onMove, onRemove, onAdd,
            renderControls: (s) => <SectionControls section={s} products={products} patch={patchSection} />,
          }}
        />
      </div>
    </div>
  );
}

/** Per-block non-text controls (image, product picker, CTA target, side). */
function SectionControls({ section, products, patch }: {
  section: LandingSection; products: Product[]; patch: (id: string, p: Record<string, unknown>) => void;
}) {
  const published = products.filter((p) => p.status === "published");

  const upload = async (file: File | undefined, key: "background" | "image") => {
    if (!file) return;
    const { uploadId } = await api.upload(file);
    if (key === "background" && section.type === "hero") patch(section.id, { background: { ...section.background, imageId: uploadId } });
    else patch(section.id, { imageId: uploadId });
  };

  if (section.type === "hero") {
    return (
      <>
        <label className="se-field"><span className="eyebrow">Button links to</span>
          <select value={section.cta.target} onChange={(e) => patch(section.id, { cta: { ...section.cta, target: e.target.value } })}>
            <option value="#products">Scroll to products</option>
            {published.map((p) => <option key={p.id} value={`/p/${p.slug}`}>Product: {p.name}</option>)}
          </select>
        </label>
        <div className="se-field"><span className="eyebrow">Background</span>
          <div className="se-row">
            <input type="color" value={section.background.color ?? "#ffffff"}
              onChange={(e) => patch(section.id, { background: { ...section.background, color: e.target.value, imageId: null } })} />
            <label className="btn sm file">Image<input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "background")} /></label>
            {(section.background.imageId || section.background.color) &&
              <button className="btn sm" onClick={() => patch(section.id, { background: { imageId: null, color: null } })}>Clear</button>}
          </div>
        </div>
      </>
    );
  }

  if (section.type === "featured") {
    const chosen = section.productIds;
    const toggle = (id: string) => patch(section.id, { productIds: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
    return (
      <div className="se-field"><span className="eyebrow">Products — click to add, in order</span>
        <div className="se-picks">
          {published.map((p) => {
            const i = chosen.indexOf(p.id);
            return (
              <button key={p.id} className={`se-pick${i >= 0 ? " on" : ""}`} onClick={() => toggle(p.id)}>
                {i >= 0 && <span className="se-num">{i + 1}</span>}{p.name}
              </button>
            );
          })}
          {!published.length && <span className="hint">Publish products first to feature them.</span>}
        </div>
      </div>
    );
  }

  if (section.type === "story") {
    return (
      <>
        <div className="se-field"><span className="eyebrow">Image</span>
          <div className="se-row">
            <label className="btn sm file">Upload<input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0], "image")} /></label>
            {section.imageId && <button className="btn sm" onClick={() => patch(section.id, { imageId: null })}>Remove</button>}
          </div>
        </div>
        <div className="se-field"><span className="eyebrow">Image side</span>
          <div className="seg">
            <button data-on={section.side === "left"} onClick={() => patch(section.id, { side: "left" })}>Left</button>
            <button data-on={section.side === "right"} onClick={() => patch(section.id, { side: "right" })}>Right</button>
          </div>
        </div>
      </>
    );
  }

  return <span className="hint">Shows every published product.</span>;
}
