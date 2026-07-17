import {
  ApiClient,
  DEFAULT_CALIBRATION,
  DesignComposer,
  SEED_ASSETS,
  WINE_TUMBLER,
  defaultValues,
  elementLabel,
  seedLibrary,
  svgDataUrl,
  type AssetElement,
  type Design,
  type DesignElement,
  type Rect,
  type SlotValues,
  type StoredProduct,
  type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./Canvas";
import { MockupPreview } from "./MockupPreview";
import { Products } from "./Products";

// Deployed builds inject VITE_API_BASE; local dev falls back to the dev Worker.
const api = new ApiClient(import.meta.env.VITE_API_BASE ?? "http://localhost:8787");

/** Brand palette. The admin picks from here which colors each slot offers. */
const PALETTE = ["#0A0A0A", "#161616", "#F5F5F0", "#FFFFFF", "#E4E4DC", "#FF5A1F"];

const DESIGN_ID = "terminal";

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

export function App() {
  const composer = useMemo(() => new DesignComposer(seedLibrary()), []);
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [name, setName] = useState("Terminal");
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [status, setStatus] = useState<string>("");
  // The OAuth callback returns with ?printful=..., so open on Products.
  const [view, setView] = useState<"composer" | "products">(() =>
    new URLSearchParams(location.search).has("printful") ? "products" : "composer",
  );

  useEffect(() => {
    // A product without a photo cannot be previewed, so it cannot be designed on.
    api.listProducts()
      .then((ps) => {
        const usable = ps.filter((p) => p.hasPhoto);
        setProducts(usable);
        setProductId((cur) => cur ?? usable[0]?.id ?? null);
      })
      .catch((e) => setStatus(`Could not load products: ${e.message}`));
  }, []);

  useEffect(() => {
    api.getDesign(DESIGN_ID)
      .then((d) => {
        setName(d.name);
        setElements(d.elements);
        if (d.productId) setProductId(d.productId);
      })
      .catch(() => setStatus("New design (nothing was saved yet)"));
  }, []);

  const product = products.find((p) => p.id === productId) ?? null;

  /**
   * The spec comes from the product, not a constant: every import carries its own
   * print file measurements, and they differ per product and per provider.
   */
  const design: Design = useMemo(
    () => ({
      id: DESIGN_ID,
      name,
      spec: product?.printSpec ?? WINE_TUMBLER,
      safeAngleDeg: product?.calibration?.safeAngleDeg ?? DEFAULT_CALIBRATION.safeAngleDeg,
      elements,
    }),
    [name, product, elements],
  );

  const setDesign = (fn: (d: Design) => Design) => {
    const next = fn(design);
    setName(next.name);
    setElements(next.elements);
  };

  /**
   * A design belongs to one product: element rects are in that product's print file
   * coordinates, and each product has its own file. Rather than a blocking confirm
   * that scattered or discarded the work, each product keeps its own in-progress
   * elements, so switching back and forth loses nothing. (A native confirm also wedged
   * the whole page on a dialog.)
   */
  const draftsRef = useRef<Map<string, DesignElement[]>>(new Map());
  const switchProduct = (id: string) => {
    if (id === productId) return;
    if (productId) draftsRef.current.set(productId, elements);
    setElements(draftsRef.current.get(id) ?? []);
    setSelectedId(null);
    setProductId(id);
    setStatus("");
  };


  // Sample text survives edits, but colors and icons must NOT: they have to follow
  // the slot default. Keeping them made the admin show a stale value while the
  // customer saw the new one, and an admin that approves something other than what
  // prints is worse than no admin.
  useEffect(() => {
    setValues((prev) => {
      const base = defaultValues(design);
      for (const el of design.elements) {
        if (el.kind !== "text") continue;
        base[el.id] = prev[el.id] ?? "KENNETH";
      }
      return base;
    });
  }, [design]);

  const selected = design.elements.find((e) => e.id === selectedId) ?? null;
  // The whole print file fills the print area now, so new elements center in the file.
  const cx = design.spec.widthPx / 2;
  const cy = design.spec.heightPx / 2;
  // The primary placement drives the editor; front first, else whatever comes first.
  const placement =
    product?.template?.placements.find((p) => /front|default/i.test(p.placement)) ??
    product?.template?.placements[0] ??
    null;

  const patch = (id: string, fn: (el: DesignElement) => DesignElement) =>
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? fn(e) : e)) }));

  const addAsset = (slug: string) => {
    const asset = SEED_ASSETS.find((a) => a.slug === slug)!;
    // Enters at its viewBox aspect: a square box would distort it.
    const targetH = asset.category === "shape" ? design.spec.heightPx * 0.5 : design.spec.heightPx * 0.3;
    const h = Math.round(targetH);
    const w = Math.round(h * asset.aspect);
    const el: AssetElement = {
      id: uid(),
      kind: "asset",
      slug,
      rect: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h },
      recolor: asset.recolorParts.map((part) => ({
        part,
        label: part,
        options: PALETTE,
        default: "#0A0A0A",
      })),
    };
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const addText = () => {
    const H = design.spec.heightPx;
    const el: TextElement = {
      id: uid(),
      kind: "text",
      // A band across the lower third of the print file, in file coords.
      rect: { x: 0, y: Math.round(H * 0.62), w: design.spec.widthPx, h: Math.round(H * 0.2) },
      label: "Your name",
      maxChars: 18,
      minSizeFrac: 0.11,
      maxLines: 2,
      color: "#0A0A0A",
      fontFamily: '"Space Grotesk", sans-serif',
      placeholder: "Type here",
    };
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const remove = (id: string) => {
    setDesign((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
  };

  const raise = (id: string, dir: -1 | 1) =>
    setDesign((d) => {
      const i = d.elements.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.elements.length) return d;
      const els = [...d.elements];
      [els[i], els[j]] = [els[j], els[i]];
      return { ...d, elements: els };
    });

  const save = async (publish: boolean) => {
    if (!productId) {
      setStatus("Import a product first.");
      return;
    }
    setStatus("Saving...");
    try {
      await api.saveDesign({
        id: design.id,
        productId,
        name: design.name,
        slug: design.id,
        priceCents: 2495,
        status: publish ? "published" : "draft",
        baseImageKey: null,
        elements: design.elements,
      });
      setStatus(publish ? "Published" : "Saved as draft");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">Abbiss</div>
        <nav className="tabs">
          <button data-on={view === "composer"} onClick={() => setView("composer")}>
            Composer
          </button>
          <button data-on={view === "products"} onClick={() => setView("products")}>
            Products
          </button>
        </nav>
        {view === "composer" && (
          <>
            <select
              value={productId ?? ""}
              onChange={(e) => switchProduct(e.target.value)}
              title="The product this design is printed on"
            >
              {products.length === 0 && <option value="">No products imported</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="name-input"
              value={design.name}
              onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))}
            />
            <div className="topbar-actions">
              <span className="hint">{status}</span>
              <button className="btn" onClick={() => save(false)}>Save</button>
              <button className="cta" onClick={() => save(true)}>Publish</button>
            </div>
          </>
        )}
      </header>

      {view === "products" && (
        <div style={{ padding: 20 }}>
          <Products api={api} />
        </div>
      )}

      <div className="admin-grid" hidden={view !== "composer"}>
        <aside className="palette">
          <span className="eyebrow">Add</span>
          <button className="btn wide" onClick={addText}>Text field</button>
          <div className="asset-grid">
            {SEED_ASSETS.map((a) => (
              <button
                key={a.slug}
                className="asset-btn"
                title={`${a.name}${a.recolorParts.length ? ` (${a.recolorParts.length} parts)` : ""}`}
                onClick={() => addAsset(a.slug)}
              >
                <img src={svgDataUrl(a.svg)} alt={a.name} />
              </button>
            ))}
          </div>

          <span className="eyebrow" style={{ marginTop: 18 }}>Layers</span>
          <ul className="layers">
            {[...design.elements].reverse().map((el) => (
              <li key={el.id} data-selected={el.id === selectedId}>
                <button className="layer-name" onClick={() => setSelectedId(el.id)}>
                  {elementLabel(el)}
                </button>
                <button className="mini" onClick={() => raise(el.id, 1)} title="Move up">^</button>
                <button className="mini" onClick={() => raise(el.id, -1)} title="Move down">v</button>
                <button className="mini" onClick={() => remove(el.id)} title="Remove">x</button>
              </li>
            ))}
            {design.elements.length === 0 && <li className="empty">No elements</li>}
          </ul>
        </aside>

        <main>
          <Canvas
            design={design}
            values={values}
            composer={composer}
            template={placement}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, rect: Rect) => patch(id, (el) => ({ ...el, rect }))}
            onRemove={remove}
          />
        </main>

        <aside className="props">
          {product ? (
            <MockupPreview api={api} product={product} design={design} values={values} />
          ) : (
            <p className="hint">
              No product imported yet. Go to Products, connect Printful and import one.
            </p>
          )}

          {!selected && <p className="hint">Select an element to configure it.</p>}

          {selected?.kind === "asset" && (
            <>
              <span className="eyebrow">Customizable</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!selected.choice}
                  onChange={(e) =>
                    patch(selected.id, (el) => ({
                      ...(el as AssetElement),
                      choice: e.target.checked
                        ? { label: "Language", options: SEED_ASSETS.filter((a) => a.category === "icon").map((a) => a.slug) }
                        : undefined,
                    }))
                  }
                />
                Let the customer pick the icon
              </label>

              {selected.recolor.map((r, i) => (
                <div key={r.part} className="field">
                  <span className="eyebrow">Color: {r.part}</span>
                  <div className="swatches">
                    {PALETTE.map((c) => {
                      const on = r.options.includes(c);
                      return (
                        <button
                          key={c}
                          className="swatch"
                          style={{ background: c }}
                          aria-pressed={on}
                          title={on ? "Remove from the options" : "Offer this color"}
                          onClick={() =>
                            patch(selected.id, (el) => {
                              const a = el as AssetElement;
                              const rec = [...a.recolor];
                              const opts = on ? rec[i].options.filter((o) => o !== c) : [...rec[i].options, c];
                              rec[i] = { ...rec[i], options: opts, default: opts.includes(rec[i].default) ? rec[i].default : (opts[0] ?? "#0A0A0A") };
                              return { ...a, recolor: rec };
                            })
                          }
                        />
                      );
                    })}
                  </div>
                  <p className="hint">
                    {r.options.length === 0
                      ? "No options: this part stays fixed."
                      : `${r.options.length} colors offered`}
                  </p>
                  {r.options.length > 0 && (
                    <>
                      <span className="eyebrow" style={{ marginTop: 8 }}>
                        Default
                      </span>
                      <div className="swatches">
                        {r.options.map((c) => (
                          <button
                            key={c}
                            className="swatch small"
                            style={{ background: c }}
                            aria-pressed={r.default === c}
                            title="Color the customizer opens with"
                            onClick={() =>
                              patch(selected.id, (el) => {
                                const a = el as AssetElement;
                                const rec = [...a.recolor];
                                rec[i] = { ...rec[i], default: c };
                                return { ...a, recolor: rec };
                              })
                            }
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {selected.recolor.length === 0 && (
                <p className="hint">This asset declares no recolorable parts.</p>
              )}
            </>
          )}

          {selected?.kind === "text" && (
            <>
              <div className="field">
                <span className="eyebrow">Label</span>
                <input
                  type="text"
                  value={selected.label}
                  onChange={(e) => patch(selected.id, (el) => ({ ...(el as TextElement), label: e.target.value }))}
                />
              </div>
              <div className="field row">
                <label>
                  <span className="eyebrow">Max. characters</span>
                  <input
                    type="number"
                    value={selected.maxChars}
                    onChange={(e) => patch(selected.id, (el) => ({ ...(el as TextElement), maxChars: +e.target.value }))}
                  />
                </label>
                <label>
                  <span className="eyebrow">Max. lines</span>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={selected.maxLines}
                    onChange={(e) => patch(selected.id, (el) => ({ ...(el as TextElement), maxLines: +e.target.value }))}
                  />
                </label>
              </div>
              <div className="field">
                <span className="eyebrow">Text color</span>
                <div className="swatches">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      className="swatch"
                      style={{ background: c }}
                      aria-pressed={selected.color === c}
                      onClick={() => patch(selected.id, (el) => ({ ...(el as TextElement), color: c }))}
                    />
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="eyebrow">Sample text</span>
                <input
                  type="text"
                  value={values[selected.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [selected.id]: e.target.value }))}
                />
                <p className="hint">For previewing only; not saved with the design.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
