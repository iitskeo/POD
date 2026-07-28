import { createElement, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons";
import type { LandingConfig, LandingSection, LandingSectionType, Product } from "./types";

/** The default landing = today's storefront: a hero + the product grid. Used when a store
 *  has never been edited, so nothing regresses. */
export const DEFAULT_LANDING: LandingConfig = {
  version: 1,
  sections: [
    {
      id: "hero", type: "hero",
      eyebrow: "Print on demand", title: "Make it yours.",
      subtitle: "Personalize a product and see it on the real thing before you buy. No account needed.",
      cta: { label: "Shop now", target: "#products" },
      background: { imageId: null, color: null },
    },
    { id: "grid", type: "grid", title: "" },
  ],
};

const rid = () => Math.random().toString(36).slice(2, 8);

/** A fresh section of the given type with tasteful premium defaults. */
export function newSection(type: LandingSectionType): LandingSection {
  const id = `${type}-${rid()}`;
  switch (type) {
    case "hero":
      return { id, type, eyebrow: "New section", title: "A bold headline", subtitle: "Say what makes it special.", cta: { label: "Shop now", target: "#products" }, background: { imageId: null, color: null } };
    case "featured":
      return { id, type, title: "Featured", productIds: [] };
    case "grid":
      return { id, type, title: "All products" };
    case "story":
      return { id, type, title: "Our story", body: "Tell customers who you are and why this matters.", imageId: null, side: "left" };
  }
}

/** Editing hooks the admin injects; absent in the storefront (live) render. */
export interface LandingEdit {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onText: (id: string, patch: Record<string, string>) => void;
  /** Move the dragged block to before/after the target block. */
  onReorder: (dragId: string, targetId: string, after: boolean) => void;
  onRemove: (id: string) => void;
  onAdd: (afterId: string, type: LandingSectionType) => void;
  /** Per-block non-text controls (image upload, product picker, CTA target) — admin-supplied. */
  renderControls: (section: LandingSection) => ReactNode;
}

interface LandingViewProps {
  config: LandingConfig;
  products: Product[];
  photoUrl: (productId: string) => string;
  imageUrl?: (uploadId: string) => string;
  onNavigate?: (to: string) => void;
  edit?: LandingEdit;
}

/** One inline-editable text node: uncontrolled contentEditable, commits on blur so typing
 *  never triggers a re-render that would move the caret. Plain text in live mode. */
function Editable({ editing, value, onCommit, tag, className, placeholder, multiline }: {
  editing: boolean; value: string; onCommit: (v: string) => void;
  tag: "h1" | "h2" | "h3" | "p" | "span"; className?: string; placeholder?: string; multiline?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (editing && el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [editing, value]);
  if (!editing) return createElement(tag, { className }, value || null);
  const props: Record<string, unknown> = {
    ref,
    className: `${className ?? ""} lp-editable`.trim(),
    contentEditable: true,
    suppressContentEditableWarning: true,
    "data-ph": placeholder,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
    },
    onBlur: (e: FocusEvent<HTMLElement>) => onCommit(e.currentTarget.textContent ?? ""),
  };
  return createElement(tag, props);
}

function ProductCards({ products, photoUrl, onNavigate }: {
  products: Product[]; photoUrl: (id: string) => string; onNavigate?: (to: string) => void;
}) {
  if (!products.length) return <p className="hint">No products yet.</p>;
  return (
    <div className="grid">
      {products.map((p) => (
        <a key={p.id} className="card" href={`/p/${p.slug}`}
          onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(`/p/${p.slug}`); } }}>
          <div className="card-img">{p.hasPhoto ? <img src={photoUrl(p.id)} alt={p.name} /> : <div className="ph" />}</div>
          <div className="card-body">
            <h3>{p.name}</h3>
            <span className="mono price">from ${(p.retailPriceCents / 100).toFixed(2)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

/** The storefront landing, and the admin's live editor surface. One renderer, both apps. */
export function LandingView({ config, products, photoUrl, imageUrl, onNavigate, edit }: LandingViewProps) {
  const editing = !!edit;
  const published = products.filter((p) => p.status === "published");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overAfter, setOverAfter] = useState(false);

  const ctaClick = (target: string) => {
    if (editing) return;
    if (target.startsWith("#")) document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
    else if (target) onNavigate?.(target);
  };

  const heroBg = (s: Extract<LandingSection, { type: "hero" }>) => {
    const img = s.background.imageId && imageUrl ? `url(${imageUrl(s.background.imageId)})` : null;
    if (img) return { backgroundImage: img, backgroundSize: "cover", backgroundPosition: "center" };
    if (s.background.color) return { background: s.background.color };
    return undefined;
  };

  return (
    <div className={`landing${editing ? " editing" : ""}`}>
      {config.sections.map((s) => {
        const sel = edit?.selectedId === s.id;
        const body = (() => {
          switch (s.type) {
            case "hero":
              return (
                <section className="lp-hero" style={heroBg(s)}>
                  <Editable editing={editing} tag="span" className="eyebrow" placeholder="Eyebrow"
                    value={s.eyebrow} onCommit={(v) => edit!.onText(s.id, { eyebrow: v })} />
                  <Editable editing={editing} tag="h1" className="lp-title" placeholder="Headline"
                    value={s.title} onCommit={(v) => edit!.onText(s.id, { title: v })} />
                  <Editable editing={editing} tag="p" className="lp-sub" placeholder="Subtitle" multiline
                    value={s.subtitle} onCommit={(v) => edit!.onText(s.id, { subtitle: v })} />
                  {(s.cta.label || editing) && (
                    <a className="cta" href="#" onClick={(e) => { e.preventDefault(); ctaClick(s.cta.target); }}>
                      <Editable editing={editing} tag="span" placeholder="Button"
                        value={s.cta.label} onCommit={(v) => edit!.onText(s.id, { "cta.label": v })} />
                    </a>
                  )}
                </section>
              );
            case "featured": {
              const list = s.productIds.map((id) => published.find((p) => p.id === id)).filter(Boolean) as Product[];
              return (
                <section className="lp-block" id="products">
                  <Editable editing={editing} tag="h2" className="lp-h" placeholder="Section title"
                    value={s.title} onCommit={(v) => edit!.onText(s.id, { title: v })} />
                  <ProductCards products={list} photoUrl={photoUrl} onNavigate={onNavigate} />
                </section>
              );
            }
            case "grid":
              return (
                <section className="lp-block" id="products">
                  {(s.title || editing) && (
                    <Editable editing={editing} tag="h2" className="lp-h" placeholder="Section title"
                      value={s.title} onCommit={(v) => edit!.onText(s.id, { title: v })} />
                  )}
                  <ProductCards products={published} photoUrl={photoUrl} onNavigate={onNavigate} />
                </section>
              );
            case "story":
              return (
                <section className={`lp-story side-${s.side}`}>
                  {s.imageId && imageUrl && <div className="lp-story-img"><img src={imageUrl(s.imageId)} alt="" /></div>}
                  <div className="lp-story-text">
                    <Editable editing={editing} tag="h2" className="lp-h" placeholder="Title"
                      value={s.title} onCommit={(v) => edit!.onText(s.id, { title: v })} />
                    <Editable editing={editing} tag="p" className="lp-body" placeholder="Your story…" multiline
                      value={s.body} onCommit={(v) => edit!.onText(s.id, { body: v })} />
                  </div>
                </section>
              );
          }
        })();

        if (!editing) return <div key={s.id}>{body}</div>;
        const dragging = dragId === s.id;
        const over = overId === s.id && dragId !== s.id;
        return (
          <div key={s.id}
            className={`lp-wrap${sel ? " sel" : ""}${dragging ? " dragging" : ""}${over ? (overAfter ? " over-after" : " over-before") : ""}`}
            onClick={() => edit!.onSelect(s.id)}
            onDragOver={(e) => {
              if (!dragId || dragId === s.id) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setOverId(s.id); setOverAfter(e.clientY > r.top + r.height / 2);
            }}
            onDrop={(e) => {
              if (!dragId || dragId === s.id) return;
              e.preventDefault();
              edit!.onReorder(dragId, s.id, overAfter);
              setDragId(null); setOverId(null);
            }}>
            <div className="lp-tools" onClick={(e) => e.stopPropagation()}>
              <span className="tb-btn lp-drag" title="Drag to reorder" draggable
                onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}>
                <Icon name="move-vertical" size={15} />
              </span>
              <button className="tb-btn danger" title="Remove" onClick={() => edit!.onRemove(s.id)}><Icon name="trash" size={15} /></button>
            </div>
            {body}
            {sel && <div className="lp-ctl" onClick={(e) => e.stopPropagation()}>{edit!.renderControls(s)}</div>}
            <AddBlock onAdd={(t) => edit!.onAdd(s.id, t)} />
          </div>
        );
      })}
    </div>
  );
}

const BLOCKS: { type: LandingSectionType; label: string }[] = [
  { type: "hero", label: "Hero" }, { type: "featured", label: "Featured" },
  { type: "grid", label: "Product grid" }, { type: "story", label: "Story" },
];

function AddBlock({ onAdd }: { onAdd: (t: LandingSectionType) => void }) {
  return (
    <div className="lp-add" onClick={(e) => e.stopPropagation()}>
      <span className="lp-add-line" />
      <div className="lp-add-menu">
        <Icon name="plus" size={14} />
        {BLOCKS.map((b) => <button key={b.type} onClick={() => onAdd(b.type)}>{b.label}</button>)}
      </div>
    </div>
  );
}
