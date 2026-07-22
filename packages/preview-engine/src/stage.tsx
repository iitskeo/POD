import { useEffect, useMemo, useRef, useState } from "react";
import { renderArtwork, type Resolver } from "./compose";
import { elementLabel, snapRect } from "./util";
import type { Element, Placement, Rect, SlotValues } from "./types";

const EDITOR_SCALE = 0.4;

interface Props {
  placement: Placement;
  elements: Element[];
  values: SlotValues;
  resolver: Resolver;
  mode: "author" | "customize";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, rect: Rect, rotation: number) => void;
  onRemove?: (id: string) => void;
  onOverflow?: (overflow: boolean) => void;
}

type Drag =
  | { mode: "move"; id: string; sx: number; sy: number; rect: Rect; rot: number }
  | { mode: "resize"; id: string; sx: number; sy: number; rect: Rect; rot: number }
  | { mode: "rotate"; id: string; cx: number; cy: number; rect: Rect; start: number };

/**
 * The product stage: the real template with the print area marked and the live
 * composition inside it. Author mode adds select/move/scale/rotate; customize mode is
 * a read-only preview. Shared by the admin composer and the storefront customizer.
 */
export function PlacementStage({
  placement, elements, values, resolver, mode,
  selectedId, onSelect, onChange, onRemove, onOverflow,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const { widthPx: W, heightPx: H } = placement.printSpec;
  const area = useMemo(() => ({
    left: placement.printArea.left / placement.templateWidth,
    top: placement.printArea.top / placement.templateHeight,
    width: placement.printArea.width / placement.templateWidth,
    height: placement.printArea.height / placement.templateHeight,
  }), [placement]);

  useEffect(() => {
    let stale = false;
    (async () => {
      const c = canvasRef.current;
      if (!c) return;
      const res = await renderArtwork(c, placement, elements, values, resolver, EDITOR_SCALE);
      if (!stale) onOverflow?.(res.overflow);
    })();
    return () => { stale = true; };
  }, [placement, elements, values, resolver, onOverflow]);

  useEffect(() => {
    if (mode !== "author") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (typing || !selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onRemove?.(selectedId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selectedId, onRemove]);

  const toFile = (dx: number, dy: number) => {
    const el = surfaceRef.current!;
    const areaW = el.clientWidth * area.width, areaH = el.clientHeight * area.height;
    return { dx: (dx / areaW) * W, dy: (dy / areaH) * H };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const el = elements.find((x) => x.id === drag.id);
      if (!el) return;
      if (drag.mode === "rotate") {
        const ang = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI + 90;
        onChange?.(drag.id, drag.rect, Math.round(ang));
        return;
      }
      const { dx, dy } = toFile(e.clientX - drag.sx, e.clientY - drag.sy);
      if (drag.mode === "move") {
        const moved = { ...drag.rect, x: Math.round(drag.rect.x + dx), y: Math.round(drag.rect.y + dy) };
        onChange?.(drag.id, snapRect(moved, W, H, W * 0.02), drag.rot);
      } else {
        onChange?.(drag.id, {
          ...drag.rect,
          w: Math.max(20, Math.round(drag.rect.w + dx)),
          h: Math.max(20, Math.round(drag.rect.h + dy)),
        }, drag.rot);
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, elements, onChange]);

  const pct = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
  });

  const visible = elements.filter((e) => e.placement === placement.placement && !e.hidden);

  return (
    <div className="stage">
      <div
        className="stage-surface"
        ref={surfaceRef}
        style={{
          aspectRatio: `${placement.templateWidth} / ${placement.templateHeight}`,
          backgroundColor: placement.backgroundColor ?? undefined,
          backgroundImage: `url(${placement.imageUrl})`,
        }}
        onPointerDown={(e) => { if (mode === "author" && e.target === e.currentTarget) onSelect?.(null); }}
      >
        <div className="print-area" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }}>
          <canvas ref={canvasRef} />
          {mode === "author" && visible.map((el) => (
            <div
              key={el.id}
              className="el-box"
              data-selected={el.id === selectedId}
              style={{ ...pct(el.rect), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              onPointerDown={(e) => {
                if (el.locked) return;
                e.stopPropagation();
                onSelect?.(el.id);
                setDrag({ mode: "move", id: el.id, sx: e.clientX, sy: e.clientY, rect: el.rect, rot: el.rotation ?? 0 });
              }}
            >
              <span className="el-tag">{elementLabel(el)}</span>
              {el.id === selectedId && !el.locked && (
                <>
                  <button className="el-remove" title="Delete" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onRemove?.(el.id); }}>&times;</button>
                  <span className="el-rotate" title="Rotate" onPointerDown={(e) => {
                    e.stopPropagation();
                    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setDrag({ mode: "rotate", id: el.id, cx: box.left + box.width / 2, cy: box.top + box.height / 2, rect: el.rect, start: el.rotation ?? 0 });
                  }} />
                  <span className="el-handle" title="Resize" onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrag({ mode: "resize", id: el.id, sx: e.clientX, sy: e.clientY, rect: el.rect, rot: el.rotation ?? 0 });
                  }} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
