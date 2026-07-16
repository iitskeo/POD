import {
  DEFAULT_CALIBRATION,
  PreviewRenderer,
  WINE_TUMBLER_11OZ,
  diameterFromWrap,
  drawArt,
  extractProfile,
  pixelsPerInch,
  safeWidthFrac,
  type ArtLayout,
  type Profile,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";

const ICONS = [
  { slug: "code", name: "Code" },
  { slug: "braces", name: "Braces" },
  { slug: "terminal", name: "Terminal" },
  { slug: "serpiente", name: "Serpiente" },
  { slug: "taza", name: "Taza" },
  { slug: "rama", name: "Rama" },
];

const MAX_CHARS = 18;

const LAYOUT: ArtLayout = {
  spec: WINE_TUMBLER_11OZ,
  iconZone: { sizeFrac: 0.42, centerYFrac: 0.36 },
  textZone: {
    heightFrac: 0.26,
    centerYFrac: 0.74,
    maxChars: MAX_CHARS,
    minSizeFrac: 0.1,
    maxLines: 2,
    color: "#ff5a1f",
    fontFamily: '"Space Grotesk", sans-serif',
  },
  safeAngleDeg: DEFAULT_CALIBRATION.safeAngleDeg,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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
  const iconsRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [iconSlug, setIconSlug] = useState("code");
  const [text, setText] = useState("KENNETH");
  const [overflow, setOverflow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // La banda imprimible: la silueta da la escala, el spec da el alto fisico.
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
        const [photo, ...icons] = await Promise.all([
          loadImage("/tumbler.png"),
          ...ICONS.map((i) => loadImage(`/icons/${i.slug}.svg`)),
        ]);
        if (cancelled) return;
        ICONS.forEach((i, n) => iconsRef.current.set(i.slug, icons[n]));

        const canvas = canvasRef.current!;
        canvas.width = photo.naturalWidth;
        canvas.height = photo.naturalHeight;
        rendererRef.current = new PreviewRenderer(canvas, photo);
        setProfile(extractProfile(toImageData(photo)));
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !profile || !band) return;
    const res = drawArt(
      artRef.current,
      LAYOUT,
      { icon: iconsRef.current.get(iconSlug) ?? null, text },
      0.5,
    );
    setOverflow(res.overflow);
    renderer.render({ profile, band, art: artRef.current });
  }, [profile, band, iconSlug, text]);

  const safePct = Math.round(
    safeWidthFrac(LAYOUT.safeAngleDeg, WINE_TUMBLER_11OZ.wraps360) * 100,
  );

  if (error) {
    return (
      <div className="wrap">
        <p className="eyebrow">Error</p>
        <h1>No se pudo cargar el personalizador</h1>
        <p className="lede">{error}</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="brand">Abbiss</div>

      <header style={{ marginTop: 40 }}>
        <p className="eyebrow">Paso 01 &middot; Personaliza</p>
        <h1>Tu tumbler, con tu nombre.</h1>
        <p className="lede">
          Elige un icono, escribe tu nombre y ve exactamente como queda. Sin cuenta,
          sin registrarte.
        </p>
      </header>

      <div className="studio">
        <div className="stage">
          <canvas ref={canvasRef} />
        </div>

        <div className="panel">
          <div className="field">
            <span className="eyebrow">Icono</span>
            <div className="icons">
              {ICONS.map((i) => (
                <button
                  key={i.slug}
                  className="icon-btn"
                  aria-pressed={iconSlug === i.slug}
                  onClick={() => setIconSlug(i.slug)}
                  title={i.name}
                >
                  <img src={`/icons/${i.slug}.svg`} alt={i.name} />
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="eyebrow">Tu nombre o puesto</span>
            <input
              type="text"
              value={text}
              maxLength={MAX_CHARS}
              placeholder="Escribe aqui"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="hint" data-warn={overflow}>
              {overflow
                ? "Se pasa del area segura. Acorta el texto."
                : `${text.length}/${MAX_CHARS} caracteres`}
            </p>
          </div>

          <button className="cta" disabled={!ready || overflow || !text.trim()}>
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
