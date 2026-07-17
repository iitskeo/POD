import {
  DesignComposer,
  elementLabel,
  type Design,
  type PlacementTemplate,
  type Rect,
  type SlotValues,
} from "@abbiss/preview-engine";
import { useEffect, useRef, useState } from "react";

interface Props {
  design: Design;
  values: SlotValues;
  composer: DesignComposer;
  /** Printful's flat template: the product photo and where the print area sits on it. */
  template: PlacementTemplate | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, rect: Rect) => void;
  onRemove: (id: string) => void;
}

type Drag =
  | { mode: "move"; id: string; startX: number; startY: number; orig: Rect }
  | { mode: "resize"; id: string; startX: number; startY: number; orig: Rect };

const EDITOR_SCALE = 0.35;

/**
 * The design is laid out directly on the real product, the way Printful's editor does
 * it: the product photo behind, the print area marked, the artwork composited flat
 * inside it. No silhouette, no wrap, no cylinder maths; it reads right on a tumbler, a
 * cap or a bag because the template comes from Printful per product.
 */
export function Canvas({
  design, values, composer, template, selectedId, onSelect, onMove, onRemove,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const { widthPx: W, heightPx: H } = design.spec;

  // Print area as a fraction of the template image; the whole print file maps into it.
  const area = template
    ? {
        left: template.printArea.left / template.templateWidth,
        top: template.printArea.top / template.templateHeight,
        width: template.printArea.width / template.templateWidth,
        height: template.printArea.height / template.templateHeight,
      }
    : { left: 0, top: 0, width: 1, height: 1 };

  useEffect(() => {
    let stale = false;
    (async () => {
      const c = canvasRef.current;
      if (!c) return;
      await composer.draw(c, design, values, EDITOR_SCALE);
      if (stale) return;
    })();
    return () => { stale = true; };
  }, [design, values, composer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (typing || !selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onRemove(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onRemove]);

  // Screen delta -> print-file delta. The print area, not the whole surface, holds the
  // print file, so the scale is measured against the area's on-screen width.
  const toFile = (dx: number, dy: number) => {
    const el = surfaceRef.current!;
    const areaW = el.clientWidth * area.width;
    const areaH = el.clientHeight * area.height;
    return { dx: (dx / areaW) * W, dy: (dy / areaH) * H };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { dx, dy } = toFile(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.mode === "move") {
        onMove(drag.id, { ...drag.orig, x: Math.round(drag.orig.x + dx), y: Math.round(drag.orig.y + dy) });
      } else {
        onMove(drag.id, {
          ...drag.orig,
          w: Math.max(40, Math.round(drag.orig.w + dx)),
          h: Math.max(40, Math.round(drag.orig.h + dy)),
        });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, onMove]);

  // Element rect is in print-file coords; the print area holds it, so % are relative
  // to the area, not the template.
  const pct = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`,
    height: `${(r.h / H) * 100}%`,
  });

  const aspect = template
    ? `${template.templateWidth} / ${template.templateHeight}`
    : `${W} / ${H}`;

  return (
    <div className="editor">
      <div
        className="editor-surface"
        ref={surfaceRef}
        data-plain={!template}
        style={{
          aspectRatio: aspect,
          backgroundColor: template?.backgroundColor ?? undefined,
          backgroundImage: template ? `url(${template.imageUrl})` : undefined,
        }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        <div
          className="print-area"
          style={{
            left: `${area.left * 100}%`,
            top: `${area.top * 100}%`,
            width: `${area.width * 100}%`,
            height: `${area.height * 100}%`,
          }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
        >
          <canvas ref={canvasRef} />

          {design.elements.map((el) => (
            <div
              key={el.id}
              className="el-box"
              data-selected={el.id === selectedId}
              style={pct(el.rect)}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(el.id);
                setDrag({ mode: "move", id: el.id, startX: e.clientX, startY: e.clientY, orig: el.rect });
              }}
            >
              <span className="el-tag">{elementLabel(el)}</span>
              {el.id === selectedId && (
                <>
                  <button
                    className="el-remove"
                    title="Delete this element (or press Delete)"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onRemove(el.id); }}
                  >
                    &times;
                  </button>
                  <span
                    className="el-handle"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setDrag({ mode: "resize", id: el.id, startX: e.clientX, startY: e.clientY, orig: el.rect });
                    }}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="hint">
        {template
          ? "Design sits inside the dashed print area, shown on the real product. Anything outside it is not printed."
          : `Flat print file, ${W} × ${H} px.`}
      </p>
    </div>
  );
}
