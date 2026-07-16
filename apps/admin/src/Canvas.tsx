import {
  DesignComposer,
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
}

type Drag =
  | { mode: "move"; id: string; startX: number; startY: number; orig: Rect }
  | { mode: "resize"; id: string; startX: number; startY: number; orig: Rect };

const EDITOR_SCALE = 0.25;

export function Canvas({ design, values, composer, selectedId, onSelect, onMove }: Props) {
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

  /** px de pantalla -> px del archivo de impresion. */
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
          <span className="safe-tag">zona segura &plusmn;{design.safeAngleDeg}&deg;</span>
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
            <span className="el-tag">{el.kind === "text" ? el.label : el.slug}</span>
            {el.id === selectedId && (
              <span
                className="el-handle"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDrag({ mode: "resize", id: el.id, startX: e.clientX, startY: e.clientY, orig: el.rect });
                }}
              />
            )}
          </div>
        ))}
      </div>

      <p className="hint">
        El archivo mide {W} &times; {H} px y envuelve el vaso 360&deg;. Solo el{" "}
        {Math.round((safe.w / W) * 100)}% central se ve de frente: fuera de la zona
        segura el diseno se va por detras.
      </p>
    </div>
  );
}
