import {
  DesignComposer,
  elementLabel,
  safeRect,
  type Design,
  type Rect,
  type SlotValues,
} from "@abbiss/preview-engine";
import { useEffect, useRef, useState } from "react";

interface Props {
  design: Design;
  values: SlotValues;
  composer: DesignComposer;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, rect: Rect) => void;
  onRemove: (id: string) => void;
}

type Drag =
  | { mode: "move"; id: string; startX: number; startY: number; orig: Rect }
  | { mode: "resize"; id: string; startX: number; startY: number; orig: Rect };

const EDITOR_SCALE = 0.25;

export function Canvas({
  design, values, composer, selectedId, onSelect, onMove, onRemove,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const { widthPx: W, heightPx: H } = design.spec;
  const safe = safeRect(design);

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

  // Delete removes the selection, as in any editor.
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

  /** screen px -> print file px. */
  const toFile = (dx: number, dy: number) => {
    const el = wrapRef.current!;
    const k = W / el.clientWidth;
    return { dx: dx * k, dy: dy * k };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const { dx, dy } = toFile(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.mode === "move") {
        onMove(drag.id, {
          ...drag.orig,
          x: Math.round(drag.orig.x + dx),
          y: Math.round(drag.orig.y + dy),
        });
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

  const pct = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`,
    height: `${(r.h / H) * 100}%`,
  });

  return (
    <div className="editor">
      <div
        className="editor-surface"
        ref={wrapRef}
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        <canvas ref={canvasRef} />

        <div className="safe-zone" style={pct(safe)}>
          <span className="safe-tag">safe zone &plusmn;{design.safeAngleDeg}&deg;</span>
        </div>

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
                {/* Delete lived only in the Layers list, where nobody found it. */}
                <button
                  className="el-remove"
                  title="Delete this element (or press Delete)"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(el.id);
                  }}
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

      <p className="hint">
        The file is {W} &times; {H} px and wraps {design.spec.wrapDegrees ?? 360}&deg; around
        the product. Only the middle {Math.round((safe.w / W) * 100)}% is visible from the
        front: past the safe zone the design goes around the back.
      </p>
    </div>
  );
}
