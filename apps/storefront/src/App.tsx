import {
  DEFAULT_CALIBRATION,
  DesignComposer,
  PreviewRenderer,
  WINE_TUMBLER_11OZ,
  defaultValues,
  diameterFromWrap,
  extractProfile,
  pixelsPerInch,
  safeWidthFrac,
  type Design,
  type Profile,
  type SlotValues,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";

const ICONS = ["code", "braces", "terminal", "serpiente", "taza", "rama"];

/**
 * Este diseno vendra de D1; aqui esta inline mientras no exista el admin.
 * Los colores del marco son neutros y los acentos viven solo en la barra: el manual
 * exige un unico acento por composicion, y curando las opciones el cliente no puede
 * romperlo.
 */
const DESIGN: Omit<Design, "svg"> = {
  id: "terminal",
  name: "Terminal",
  spec: WINE_TUMBLER_11OZ,
  safeAngleDeg: DEFAULT_CALIBRATION.safeAngleDeg,
  slots: [
    {
      id: "marco", type: "color", label: "Marco", target: "marco",
      options: ["#F5F5F0", "#FFFFFF", "#E4E4DC"], default: "#F5F5F0",
    },
    {
      id: "barra", type: "color", label: "Barra", target: "barra",
      options: ["#FF5A1F", "#0A0A0A", "#161616"], default: "#FF5A1F",
    },
    {
      id: "icono", type: "choice", label: "Lenguaje", target: "icono",
      options: ICONS, default: "code",
    },
    {
      id: "nombre", type: "text", label: "Tu nombre o puesto", target: "nombre",
      maxChars: 18, minSizeFrac: 0.11, maxLines: 2,
      color: "#0A0A0A", fontFamily: '"Space Grotesk", sans-serif',
      placeholder: "Escribe aqui",
    },
  ],
};

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

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const composerRef = useRef<DesignComposer | null>(null);

  const [design, setDesign] = useState<Design | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [overflow, setOverflow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const band = useMemo(() => {
    if (!profile) return null;
    const diameter = diameterFromWrap(WINE_TUMBLER_11OZ.widthPx / WINE_TUMBLER_11OZ.dpi);
    const ppi = pixelsPerInch(profile, diameter);
    const heightIn = WINE_TUMBLER_11OZ.heightPx / WINE_TUMBLER_11OZ.dpi;
    return { yStart: profile.yTop, height: heightIn * ppi };
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.ready;
        const assets = new Map<string, HTMLImageElement>();
        const [photo, svg, ...icons] = await Promise.all([
          loadImage("/tumbler.png"),
          fetch("/designs/terminal.svg").then((r) => r.text()),
          ...ICONS.map((s) => loadImage(`/icons/${s}.svg`)),
        ]);
        if (cancelled) return;
        ICONS.forEach((s, i) => assets.set(s, icons[i]));

        const canvas = canvasRef.current!;
        canvas.width = photo.naturalWidth;
        canvas.height = photo.naturalHeight;
        rendererRef.current = new PreviewRenderer(canvas, photo);
        composerRef.current = new DesignComposer({ get: (s) => assets.get(s) });

        const d: Design = { ...DESIGN, svg };
        setProfile(extractProfile(toImageData(photo)));
        setValues({ ...defaultValues(d), nombre: "KENNETH" });
        setDesign(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const composer = composerRef.current;
    if (!renderer || !composer || !design || !profile || !band) return;
    let stale = false;
    (async () => {
      const res = await composer.draw(artRef.current, design, values, 0.5);
      if (stale) return;
      setOverflow(res.overflow);
      renderer.render({ profile, band, art: artRef.current });
    })();
    return () => { stale = true; };
  }, [design, profile, band, values]);

  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  if (error) {
    return (
      <div className="wrap">
        <p className="eyebrow">Error</p>
        <h1>No se pudo cargar el personalizador</h1>
        <p className="lede">{error}</p>
      </div>
    );
  }

  const safePct = Math.round(
    safeWidthFrac(DESIGN.safeAngleDeg, WINE_TUMBLER_11OZ.wraps360) * 100,
  );
  const textSlot = DESIGN.slots.find((s) => s.type === "text");

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
          {DESIGN.slots.map((slot) => {
            if (slot.type === "color") {
              return (
                <div className="field" key={slot.id}>
                  <span className="eyebrow">{slot.label}</span>
                  <div className="swatches">
                    {slot.options.map((c) => (
                      <button
                        key={c}
                        className="swatch"
                        style={{ background: c }}
                        aria-pressed={values[slot.id] === c}
                        aria-label={c}
                        onClick={() => set(slot.id, c)}
                      />
                    ))}
                  </div>
                </div>
              );
            }
            if (slot.type === "choice") {
              return (
                <div className="field" key={slot.id}>
                  <span className="eyebrow">{slot.label}</span>
                  <div className="icons">
                    {slot.options.map((s) => (
                      <button
                        key={s}
                        className="icon-btn"
                        aria-pressed={values[slot.id] === s}
                        onClick={() => set(slot.id, s)}
                        title={s}
                      >
                        <img src={`/icons/${s}.svg`} alt={s} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            if (slot.type === "text") {
              return (
                <div className="field" key={slot.id}>
                  <span className="eyebrow">{slot.label}</span>
                  <input
                    type="text"
                    value={values[slot.id] ?? ""}
                    maxLength={slot.maxChars}
                    placeholder={slot.placeholder}
                    onChange={(e) => set(slot.id, e.target.value)}
                  />
                  <p className="hint" data-warn={overflow}>
                    {overflow
                      ? "Se pasa del area segura. Acorta el texto."
                      : `${(values[slot.id] ?? "").length}/${slot.maxChars} caracteres`}
                  </p>
                </div>
              );
            }
            return null;
          })}

          <button
            className="cta"
            disabled={!design || overflow || !(values[textSlot?.id ?? ""] ?? "").trim()}
          >
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
