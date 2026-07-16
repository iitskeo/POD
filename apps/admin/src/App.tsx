import {
  ApiClient,
  DEFAULT_CALIBRATION,
  DesignComposer,
  SEED_ASSETS,
  WINE_TUMBLER_11OZ,
  defaultValues,
  safeRect,
  seedLibrary,
  svgDataUrl,
  type AssetElement,
  type Design,
  type DesignElement,
  type Rect,
  type SlotValues,
  type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "./Canvas";
import { Preview } from "./Preview";
import { Productos } from "./Productos";

const api = new ApiClient("http://localhost:8787");

/** Paleta de la marca. El admin elige de aqui que colores ofrece cada slot. */
const PALETA = ["#0A0A0A", "#161616", "#F5F5F0", "#FFFFFF", "#E4E4DC", "#FF5A1F"];

const DESIGN_ID = "terminal";

/**
 * El producto viene hardcodeado mientras no exista el import de Printify.
 * Sus medidas salen del template oficial del Wine Tumbler 11oz.
 */
const EMPTY: Design = {
  id: DESIGN_ID,
  name: "Terminal",
  spec: WINE_TUMBLER_11OZ,
  safeAngleDeg: DEFAULT_CALIBRATION.safeAngleDeg,
  elements: [],
};

function uid() {
  return crypto.randomUUID().slice(0, 8);
}

export function App() {
  const composer = useMemo(() => new DesignComposer(seedLibrary()), []);
  const [design, setDesign] = useState<Design>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [status, setStatus] = useState<string>("");
  // El callback del OAuth vuelve con ?printful=..., asi que abrimos en Productos.
  const [vista, setVista] = useState<"compositor" | "productos">(() =>
    new URLSearchParams(location.search).has("printful") ? "productos" : "compositor",
  );

  useEffect(() => {
    api.getDesign(DESIGN_ID)
      .then((d) => setDesign({ ...EMPTY, name: d.name, elements: d.elements }))
      .catch(() => setStatus("Diseno nuevo (no habia nada guardado)"));
  }, []);

  // El texto de muestra se conserva al editar, pero los colores y los iconos NO:
  // tienen que seguir al default del slot. Conservarlos hacia que el admin siguiera
  // mostrando un valor viejo mientras el cliente veia el nuevo, y un admin que
  // aprueba algo distinto a lo que se imprime es peor que no tener admin.
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
  const safe = safeRect(design);

  const patch = (id: string, fn: (el: DesignElement) => DesignElement) =>
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? fn(e) : e)) }));

  const addAsset = (slug: string) => {
    const asset = SEED_ASSETS.find((a) => a.slug === slug)!;
    // Entra con la proporcion de su viewBox: una caja cuadrada lo deformaria.
    const h = asset.category === "forma" ? 470 : 260;
    const w = Math.round(h * asset.aspect);
    const el: AssetElement = {
      id: uid(),
      kind: "asset",
      slug,
      rect: {
        x: Math.round(safe.x + safe.w / 2 - w / 2),
        y: Math.round(design.spec.heightPx / 2 - h / 2),
        w,
        h,
      },
      recolor: asset.recolorParts.map((part) => ({
        part,
        label: part,
        options: PALETA,
        default: "#0A0A0A",
      })),
    };
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  };

  const addText = () => {
    const el: TextElement = {
      id: uid(),
      kind: "text",
      rect: { x: Math.round(safe.x), y: 620, w: Math.round(safe.w), h: 170 },
      label: "Tu nombre",
      maxChars: 18,
      minSizeFrac: 0.11,
      maxLines: 2,
      color: "#0A0A0A",
      fontFamily: '"Space Grotesk", sans-serif',
      placeholder: "Escribe aqui",
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
    setStatus("Guardando...");
    try {
      await api.saveDesign({
        id: design.id,
        productId: "wine-tumbler-11oz",
        name: design.name,
        slug: design.id,
        priceCents: 2495,
        status: publish ? "publicado" : "borrador",
        baseImageKey: null,
        elements: design.elements,
      });
      setStatus(publish ? "Publicado" : "Guardado como borrador");
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="admin">
      <header className="topbar">
        <div className="brand">Abbiss</div>
        <nav className="tabs">
          <button data-on={vista === "compositor"} onClick={() => setVista("compositor")}>
            Compositor
          </button>
          <button data-on={vista === "productos"} onClick={() => setVista("productos")}>
            Productos
          </button>
        </nav>
        {vista === "compositor" && (
          <>
            <input
              className="name-input"
              value={design.name}
              onChange={(e) => setDesign((d) => ({ ...d, name: e.target.value }))}
            />
            <div className="topbar-actions">
              <span className="hint">{status}</span>
              <button className="btn" onClick={() => save(false)}>Guardar</button>
              <button className="cta" onClick={() => save(true)}>Publicar</button>
            </div>
          </>
        )}
      </header>

      {vista === "productos" && (
        <div style={{ padding: 20 }}>
          <Productos api={api} />
        </div>
      )}

      <div className="admin-grid" hidden={vista !== "compositor"}>
        <aside className="palette">
          <span className="eyebrow">Agregar</span>
          <button className="btn wide" onClick={addText}>Campo de texto</button>
          <div className="asset-grid">
            {SEED_ASSETS.map((a) => (
              <button
                key={a.slug}
                className="asset-btn"
                title={`${a.name}${a.recolorParts.length ? ` (${a.recolorParts.length} partes)` : ""}`}
                onClick={() => addAsset(a.slug)}
              >
                <img src={svgDataUrl(a.svg)} alt={a.name} />
              </button>
            ))}
          </div>

          <span className="eyebrow" style={{ marginTop: 18 }}>Capas</span>
          <ul className="layers">
            {[...design.elements].reverse().map((el) => (
              <li key={el.id} data-selected={el.id === selectedId}>
                <button className="layer-name" onClick={() => setSelectedId(el.id)}>
                  {el.kind === "text" ? el.label : el.slug}
                </button>
                <button className="mini" onClick={() => raise(el.id, 1)} title="Subir">^</button>
                <button className="mini" onClick={() => raise(el.id, -1)} title="Bajar">v</button>
                <button className="mini" onClick={() => remove(el.id)} title="Quitar">x</button>
              </li>
            ))}
            {design.elements.length === 0 && <li className="empty">Sin elementos</li>}
          </ul>
        </aside>

        <main>
          <Canvas
            design={design}
            values={values}
            composer={composer}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, rect: Rect) => patch(id, (el) => ({ ...el, rect }))}
          />
        </main>

        <aside className="props">
          <Preview design={design} values={values} composer={composer} />

          {!selected && <p className="hint">Selecciona un elemento para configurarlo.</p>}

          {selected?.kind === "asset" && (
            <>
              <span className="eyebrow">Personalizable</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!selected.choice}
                  onChange={(e) =>
                    patch(selected.id, (el) => ({
                      ...(el as AssetElement),
                      choice: e.target.checked
                        ? { label: "Lenguaje", options: SEED_ASSETS.filter((a) => a.category === "icono").map((a) => a.slug) }
                        : undefined,
                    }))
                  }
                />
                El cliente elige el icono
              </label>

              {selected.recolor.map((r, i) => (
                <div key={r.part} className="field">
                  <span className="eyebrow">Color: {r.part}</span>
                  <div className="swatches">
                    {PALETA.map((c) => {
                      const on = r.options.includes(c);
                      return (
                        <button
                          key={c}
                          className="swatch"
                          style={{ background: c }}
                          aria-pressed={on}
                          title={on ? "Quitar de las opciones" : "Ofrecer este color"}
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
                      ? "Sin opciones: esta parte queda fija."
                      : `${r.options.length} colores ofrecidos`}
                  </p>
                  {r.options.length > 0 && (
                    <>
                      <span className="eyebrow" style={{ marginTop: 8 }}>
                        Por defecto
                      </span>
                      <div className="swatches">
                        {r.options.map((c) => (
                          <button
                            key={c}
                            className="swatch small"
                            style={{ background: c }}
                            aria-pressed={r.default === c}
                            title="Color con el que abre el personalizador"
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
                <p className="hint">Este asset no declara partes recoloreables.</p>
              )}
            </>
          )}

          {selected?.kind === "text" && (
            <>
              <div className="field">
                <span className="eyebrow">Etiqueta</span>
                <input
                  type="text"
                  value={selected.label}
                  onChange={(e) => patch(selected.id, (el) => ({ ...(el as TextElement), label: e.target.value }))}
                />
              </div>
              <div className="field row">
                <label>
                  <span className="eyebrow">Max. caracteres</span>
                  <input
                    type="number"
                    value={selected.maxChars}
                    onChange={(e) => patch(selected.id, (el) => ({ ...(el as TextElement), maxChars: +e.target.value }))}
                  />
                </label>
                <label>
                  <span className="eyebrow">Max. lineas</span>
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
                <span className="eyebrow">Color del texto</span>
                <div className="swatches">
                  {PALETA.map((c) => (
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
                <span className="eyebrow">Texto de prueba</span>
                <input
                  type="text"
                  value={values[selected.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [selected.id]: e.target.value }))}
                />
                <p className="hint">Solo para probar; no se guarda con el diseno.</p>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
