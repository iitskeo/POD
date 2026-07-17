import {
  DesignComposer,
  seedLibrary,
  type ApiClient,
  type Design,
  type SlotValues,
  type StoredProduct,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  api: ApiClient;
  product: StoredProduct;
  design: Design;
  values: SlotValues;
}

/**
 * The real preview: Printful renders the design on the actual product.
 *
 * This replaces the WebGL photoreal engine here. That engine needed a silhouette and
 * a wrap angle per product, and Printful's API gives the print width but never the
 * diameter, so the wrap had to be guessed and hand-corrected. Printful already knows
 * its own products: the mockup is right on a tumbler and a tee alike, with no
 * calibration.
 *
 * The trade is latency. Measured at ~10s end to end, so it is on demand rather than
 * live, which is also how Printful's own editor works: flat while you lay out, real
 * when you ask.
 */
export function MockupPreview({ api, product, design, values }: Props) {
  const composer = useMemo(() => new DesignComposer(seedLibrary()), []);
  const artRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // The mockup belongs to the design that produced it. Editing invalidates it rather
  // than leaving a stale image that looks current.
  useEffect(() => {
    setUrls([]);
    setError(null);
  }, [design, values, product.id]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setUrls([]);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    try {
      // Printful fetches the print file over HTTP, so it has to be reachable from the
      // internet. On localhost R2 is not, which is why this needs a deployed API.
      await composer.draw(artRef.current, design, values, 1);
      const blob = await new Promise<Blob | null>((r) => artRef.current.toBlob(r, "image/png"));
      if (!blob) throw new Error("Could not render the print file");

      const { url } = await api.uploadPrintFile(design.id, blob);
      setUrls(await api.mockup({ productId: product.id, printFileUrl: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  };

  return (
    <div className="preview">
      <span className="eyebrow">Real mockup</span>

      {urls.length > 0 ? (
        <div className="mockup-grid">
          {urls.map((u) => (
            <div className="preview-stage" key={u}>
              <img src={u} alt="Product mockup" />
            </div>
          ))}
        </div>
      ) : (
        <div className="preview-stage empty-stage">
          <p className="hint">
            {busy
              ? `Printful is rendering... ${elapsed}s`
              : "Printful renders your design on the real product."}
          </p>
        </div>
      )}

      <button className="btn wide" onClick={generate} disabled={busy}>
        {busy ? "Rendering..." : "Generate mockup"}
      </button>

      {error && <p className="hint" style={{ color: "var(--senal)" }}>{error}</p>}

      <p className="hint">
        {product.printSpec.widthPx}&times;{product.printSpec.heightPx}px &middot;{" "}
        {product.printSpec.dpi}dpi &middot; {product.source}
      </p>
    </div>
  );
}
