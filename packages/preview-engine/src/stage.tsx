import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { renderArtwork, type Resolver } from "./compose";
import { elementLabel, snapRect } from "./util";
import { Icon } from "./icons";
import type { Element, Placement, Rect, SlotValues } from "./types";

const EDITOR_SCALE = 0.4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
 * composition inside it. Author mode adds select/move/scale/rotate plus a living
 * canvas (spec 07 §5): staged surface with a soft contact shadow, dimmed out-of-bounds,
 * and zoom/pan. Customize mode is a read-only preview shared with the storefront.
 */
export function PlacementStage({
  placement, elements, values, resolver, mode,
  selectedId, onSelect, onChange, onRemove, onOverflow,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const authoring = mode === "author";

  // Living-canvas view state (author only).
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  // Latest view, so event handlers read fresh zoom/pan without re-subscribing.
  const viewRef = useRef({ zoom, pan });
  useEffect(() => { viewRef.current = { zoom, pan }; }, [zoom, pan]);

  const { widthPx: W, heightPx: H } = placement.printSpec;
  const aspect = placement.templateWidth / placement.templateHeight;
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

  // Fit-to-viewport baseline; recompute on resize, reset the view when the placement changes.
  const computeFit = () => {
    const vp = viewportRef.current;
    if (!vp) return 1;
    const h0 = vp.clientWidth / aspect;
    return h0 > vp.clientHeight ? vp.clientHeight / h0 : 1;
  };
  useLayoutEffect(() => {
    if (!authoring) return;
    const f = computeFit();
    setFit(f); setZoom(f); setPan({ x: 0, y: 0 });
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(() => setFit(computeFit()));
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authoring, placement]);

  // Zoom toward a point d (screen delta from viewport centre); default centre.
  const zoomTo = (next: number, d = { x: 0, y: 0 }) => {
    const { zoom: z, pan: p } = viewRef.current;
    const nz = clamp(next, 0.1, 8);
    setZoom(nz);
    setPan({ x: d.x - ((d.x - p.x) / z) * nz, y: d.y - ((d.y - p.y) / z) * nz });
  };
  const fitView = () => { const f = computeFit(); setFit(f); setZoom(f); setPan({ x: 0, y: 0 }); };

  // Ctrl/Cmd-wheel zooms toward the cursor; plain wheel/trackpad pans.
  useEffect(() => {
    if (!authoring) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const d = { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
        zoomTo(viewRef.current.zoom * (e.deltaY < 0 ? 1.12 : 0.89), d);
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [authoring]);

  // Space-bar enables hand-drag panning.
  useEffect(() => {
    if (!authoring) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "")) {
        e.preventDefault(); setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [authoring]);

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

  // Screen delta -> print-file units, accounting for the current zoom.
  const toFile = (dx: number, dy: number) => {
    const el = surfaceRef.current!;
    const areaW = el.clientWidth * area.width, areaH = el.clientHeight * area.height;
    const z = authoring ? zoom : 1;
    return { dx: (dx / z / areaW) * W, dy: (dy / z / areaH) * H };
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
  }, [drag, elements, onChange, zoom]);

  // Hand-drag panning: listeners are attached imperatively when a pan starts.
  const startPan = (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    panRef.current = start;
    const move = (ev: PointerEvent) => setPan({ x: start.ox + (ev.clientX - start.px), y: start.oy + (ev.clientY - start.py) });
    const up = () => {
      panRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
  });

  const visible = elements.filter((e) => e.placement === placement.placement && !e.hidden);

  const surface = (
    <div
      className="stage-surface"
      ref={surfaceRef}
      style={{
        aspectRatio: `${placement.templateWidth} / ${placement.templateHeight}`,
        backgroundColor: placement.backgroundColor ?? undefined,
        backgroundImage: `url(${placement.imageUrl})`,
      }}
      onPointerDown={(e) => { if (authoring && !spaceHeld && e.target === e.currentTarget) onSelect?.(null); }}
    >
      <div className="print-area" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }}>
        <canvas ref={canvasRef} />
        {authoring && visible.map((el) => (
          <div
            key={el.id}
            className="el-box"
            data-selected={el.id === selectedId}
            style={{ ...pct(el.rect), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
            onPointerDown={(e) => {
              if (el.locked || spaceHeld) return;
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
  );

  if (!authoring) return <div className="stage">{surface}</div>;

  return (
    <div className="stage">
      <div
        className="stage-viewport"
        ref={viewportRef}
        data-pan={spaceHeld || undefined}
        onPointerDown={(e) => {
          if (spaceHeld || e.button === 1) startPan(e);
          else if (e.target === e.currentTarget) onSelect?.(null);
        }}
      >
        <div className="stage-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {surface}
        </div>
      </div>
      <div className="zoom-ctl">
        <button className="mini" title="Zoom out" onClick={() => zoomTo(zoom * 0.83)}><Icon name="zoom-out" size={15} /></button>
        <button className="zoom-lvl" title="Fit to screen" onClick={fitView}>{Math.round((zoom / fit) * 100)}%</button>
        <button className="mini" title="Zoom in" onClick={() => zoomTo(zoom * 1.2)}><Icon name="zoom-in" size={15} /></button>
        <button className="mini" title="Fit to screen" onClick={fitView}><Icon name="maximize" size={15} /></button>
      </div>
    </div>
  );
}
