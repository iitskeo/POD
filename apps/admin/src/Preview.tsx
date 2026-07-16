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
}

/**
 * The same engine the customer sees. A second engine here would drift from the
 * storefront within a week and the admin would approve something other than what
 * prints (see spec 4).
 */
export function Preview({ design, values, composer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const artRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const band = useMemo(() => {
    if (!profile) return null;
    const diameter = diameterFromWrap(design.spec.widthPx / design.spec.dpi);
    const ppi = pixelsPerInch(profile, diameter);
    return { yStart: profile.yTop, height: (design.spec.heightPx / design.spec.dpi) * ppi };
  }, [profile, design.spec]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
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
    };
    img.src = "/tumbler.png";
  }, []);

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
    </div>
  );
}
