import {
  DesignComposer,
  PreviewRenderer,
  diameterFromWrap,
  extractProfile,
  pixelsPerInch,
  type Design,
  type Profile,
  type SlotValues,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  design: Design;
  values: SlotValues;
  composer: DesignComposer;
  /** The imported product's photo, served from R2. */
  photoUrl: string;
}

/**
 * The same engine the customer sees. A second engine here would drift from the
 * storefront within a week and the admin would approve something other than what
 * prints (see spec 4).
 */
export function Preview({ design, values, composer, photoUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const band = useMemo(() => {
    if (!profile) return null;
    const { widthPx, heightPx, dpi, wrapDegrees } = design.spec;
    const diameter = diameterFromWrap(widthPx / dpi, wrapDegrees ?? 360);
    const ppi = pixelsPerInch(profile, diameter);
    return { yStart: profile.yTop, height: (heightPx / dpi) * ppi };
  }, [profile, design.spec]);

  // Reruns per product: each one has its own photo, and so its own R(y).
  useEffect(() => {
    let cancel = false;
    setProfile(null);
    setError(null);
    rendererRef.current = null;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancel) return;
      try {
        const c = canvasRef.current!;
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        rendererRef.current = new PreviewRenderer(c, img);
        const tmp = document.createElement("canvas");
        tmp.width = img.naturalWidth;
        tmp.height = img.naturalHeight;
        const ctx = tmp.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        setProfile(extractProfile(ctx.getImageData(0, 0, tmp.width, tmp.height)));
      } catch (e) {
        // A photo the silhouette cannot be read from is a real outcome, not a crash:
        // catalog shots come at angles and with props.
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    img.onerror = () => !cancel && setError("Could not load the product photo");
    img.src = photoUrl;
    return () => { cancel = true; };
  }, [photoUrl]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !profile || !band) return;
    let stale = false;
    (async () => {
      await composer.draw(artRef.current, design, values, 0.5);
      if (!stale) {
        r.render({
          profile,
          band,
          art: artRef.current,
          wrapDegrees: design.spec.wrapDegrees ?? 360,
        });
      }
    })();
    return () => { stale = true; };
  }, [design, values, profile, band, composer]);

  return (
    <div className="preview">
      <span className="eyebrow">What the customer sees</span>
      <div className="preview-stage">
        <canvas ref={canvasRef} />
      </div>
      {error && (
        <p className="hint" style={{ color: "var(--senal)" }}>
          {error}. The engine needs the product front-on against a flat background.
        </p>
      )}
      {!profile && !error && <p className="hint">Reading the product silhouette...</p>}
    </div>
  );
}
