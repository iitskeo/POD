import {
  ApiClient,
  DEFAULT_CALIBRATION,
  DesignComposer,
  PreviewRenderer,
  SEED_ASSETS,
  WINE_TUMBLER,
  defaultValues,
  diameterFromWrap,
  extractProfile,
  pixelsPerInch,
  safeWidthFrac,
  seedLibrary,
  svgDataUrl,
  type Design,
  type Profile,
  type SlotValues,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";

const api = new ApiClient("http://localhost:8787");

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

function toImageData(img: HTMLImageElement): ImageData {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

const assetName = (slug: string) => SEED_ASSETS.find((a) => a.slug === slug)?.name ?? slug;
const assetSvg = (slug: string) => SEED_ASSETS.find((a) => a.slug === slug)?.svg ?? "";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const composer = useMemo(() => new DesignComposer(seedLibrary()), []);

  const [design, setDesign] = useState<Design | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [overflow, setOverflow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const band = useMemo(() => {
    if (!profile) return null;
    const diameter = diameterFromWrap(WINE_TUMBLER.widthPx / WINE_TUMBLER.dpi);
    const ppi = pixelsPerInch(profile, diameter);
    const heightIn = WINE_TUMBLER.heightPx / WINE_TUMBLER.dpi;
    return { yStart: profile.yTop, height: heightIn * ppi };
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.ready;
        const [photo, published] = await Promise.all([
          loadImage("/tumbler.png"),
          api.listDesigns("publicado"),
        ]);
        if (cancelled) return;
        if (published.length === 0) {
          setError("Todavia no hay ningun diseno publicado. Publica uno desde el admin.");
          return;
        }
        const stored = published[0];
        const d: Design = {
          id: stored.id,
          name: stored.name,
          spec: WINE_TUMBLER,
          safeAngleDeg: DEFAULT_CALIBRATION.safeAngleDeg,
          elements: stored.elements,
        };
        const canvas = canvasRef.current!;
        canvas.width = photo.naturalWidth;
        canvas.height = photo.naturalHeight;
        rendererRef.current = new PreviewRenderer(canvas, photo);
        setProfile(extractProfile(toImageData(photo)));
        setValues(defaultValues(d));
        setDesign(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !design || !profile || !band) return;
    let stale = false;
    (async () => {
      const res = await composer.draw(artRef.current, design, values, 0.5);
      if (stale) return;
      setOverflow(res.overflow);
      renderer.render({
        profile,
        band,
        art: artRef.current,
        wrapDegrees: design.spec.wrapDegrees ?? 360,
      });
    })();
    return () => { stale = true; };
  }, [design, profile, band, values, composer]);

  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  if (error) {
    return (
      <div className="wrap">
        <div className="brand">Abbiss</div>
        <p className="eyebrow" style={{ marginTop: 40 }}>Sin catalogo</p>
        <h1>Todavia no hay nada que personalizar.</h1>
        <p className="lede">{error}</p>
      </div>
    );
  }

  const safePct = Math.round(
    safeWidthFrac(DEFAULT_CALIBRATION.safeAngleDeg, WINE_TUMBLER.wrapDegrees) * 100,
  );
  const textEls = design?.elements.filter((e) => e.kind === "text" && !e.fixed) ?? [];
  const incompleto = textEls.some((e) => !(values[e.id] ?? "").trim());

  return (
    <div className="wrap">
      <div className="brand">Abbiss</div>

      <header style={{ marginTop: 40 }}>
        <p className="eyebrow">Paso 01 &middot; Personaliza</p>
        <h1>Tu tumbler, con tu nombre.</h1>
        <p className="lede">
          Elige tu lenguaje, ponle color y escribe tu nombre. Lo ves al instante, tal
          como va a quedar. Sin cuenta, sin registrarte.
        </p>
      </header>

      <div className="studio">
        <div className="stage">
          <canvas ref={canvasRef} />
        </div>

        <div className="panel">
          {design?.elements.map((el) => {
            if (el.kind === "asset") {
              return (
                <div key={el.id}>
                  {el.choice && (
                    <div className="field">
                      <span className="eyebrow">{el.choice.label}</span>
                      <div className="icons">
                        {el.choice.options.map((slug) => (
                          <button
                            key={slug}
                            className="icon-btn"
                            aria-pressed={(values[el.id] ?? el.slug) === slug}
                            onClick={() => set(el.id, slug)}
                            title={assetName(slug)}
                          >
                            <img src={svgDataUrl(assetSvg(slug))} alt={assetName(slug)} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {el.recolor
                    .filter((r) => r.options.length > 1)
                    .map((r) => (
                      <div className="field" key={r.part} style={{ marginTop: 20 }}>
                        <span className="eyebrow">{r.label}</span>
                        <div className="swatches">
                          {r.options.map((c) => (
                            <button
                              key={c}
                              className="swatch"
                              style={{ background: c }}
                              aria-label={c}
                              aria-pressed={(values[`${el.id}.${r.part}`] ?? r.default) === c}
                              onClick={() => set(`${el.id}.${r.part}`, c)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              );
            }
            if (el.kind === "text" && !el.fixed) {
              return (
                <div className="field" key={el.id}>
                  <span className="eyebrow">{el.label}</span>
                  <input
                    type="text"
                    value={values[el.id] ?? ""}
                    maxLength={el.maxChars}
                    placeholder={el.placeholder}
                    onChange={(e) => set(el.id, e.target.value)}
                  />
                  <p className="hint" data-warn={overflow}>
                    {overflow
                      ? "Se pasa del area segura. Acorta el texto."
                      : `${(values[el.id] ?? "").length}/${el.maxChars} caracteres`}
                  </p>
                </div>
              );
            }
            return null;
          })}

          <button className="cta" disabled={!design || overflow || incompleto}>
            Agregar al carrito
          </button>

          <div className="specs">
            Wine tumbler 11 oz &middot; acero inoxidable
            <br />
            Impresion 300 dpi &middot; 10.93 x 3.00 in &middot; envoltura 360
            <br />
            Area visible de frente: {safePct}% del diseno
          </div>
        </div>
      </div>
    </div>
  );
}
