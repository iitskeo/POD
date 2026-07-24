import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { renderArtwork, type Resolver } from "./compose";
import { elementLabel } from "./util";
import { Icon } from "./icons";
import type { Element, Placement, Rect, SlotValues } from "./types";

const EDITOR_SCALE = 0.4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: { id: HandleId; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" }, { id: "n", x: 50, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 100, y: 0, cursor: "nesw-resize" }, { id: "e", x: 100, y: 50, cursor: "ew-resize" },
  { id: "se", x: 100, y: 100, cursor: "nwse-resize" }, { id: "s", x: 50, y: 100, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 100, cursor: "nesw-resize" }, { id: "w", x: 0, y: 50, cursor: "ew-resize" },
];

interface Props {
  placement: Placement;
  elements: Element[];
  values: SlotValues;
  resolver: Resolver;
  mode: "author" | "customize";
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, rect: Rect, rotation: number) => void;
  onTransformStart?: () => void;
  onAction?: (action: string, id: string) => void;
  onRemove?: (id: string) => void;
  onOverflow?: (overflow: boolean) => void;
}

type Drag =
  | { mode: "move"; id: string; sx: number; sy: number; rect: Rect; rot: number }
  | { mode: "resize"; id: string; sx: number; sy: number; rect: Rect; rot: number; handle: HandleId; aspect: number | null }
  | { mode: "rotate"; id: string; cx: number; cy: number; rect: Rect; start: number };

/** Nearest snap target within threshold, across the moving element's edge/centre anchors. */
function snapAxis(anchors: number[], targets: number[], thr: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null;
  for (const a of anchors) for (const t of targets) {
    const d = t - a;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t };
  }
  return best;
}

/**
 * The product stage: the real template with the print area marked and the live composition
 * inside it. Author mode is a direct-manipulation surface (spec 07 §5-§6): living canvas with
 * zoom/pan, 8-handle transform with proportional scaling, smart guides + snapping, rotate
 * snapping, and a contextual floating toolbar. Customize mode is the read-only storefront
 * preview and is left unchanged.
 */
export function PlacementStage({
  placement, elements, values, resolver, mode,
  selectedId, onSelect, onChange, onTransformStart, onAction, onRemove, onOverflow,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const authoring = mode === "author";

  // Living-canvas view state (author only).
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
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

  const zoomTo = (next: number, d = { x: 0, y: 0 }) => {
    const { zoom: z, pan: p } = viewRef.current;
    const nz = clamp(next, 0.1, 8);
    setZoom(nz);
    setPan({ x: d.x - ((d.x - p.x) / z) * nz, y: d.y - ((d.y - p.y) / z) * nz });
  };
  const fitView = () => { const f = computeFit(); setFit(f); setZoom(f); setPan({ x: 0, y: 0 }); };

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

  const toFile = (dx: number, dy: number) => {
    const el = surfaceRef.current!;
    const areaW = el.clientWidth * area.width, areaH = el.clientHeight * area.height;
    const z = authoring ? zoom : 1;
    return { dx: (dx / z / areaW) * W, dy: (dy / z / areaH) * H };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      if (drag.mode === "rotate") {
        let ang = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI + 90;
        if (!e.shiftKey) ang = Math.round(ang / 15) * 15;   // snap to 15° unless Shift
        onChange?.(drag.id, drag.rect, Math.round(ang));
        return;
      }
      const { dx, dy } = toFile(e.clientX - drag.sx, e.clientY - drag.sy);
      if (drag.mode === "move") {
        const moved = { ...drag.rect, x: Math.round(drag.rect.x + dx), y: Math.round(drag.rect.y + dy) };
        const others = elements.filter((x) => x.placement === placement.placement && x.id !== drag.id && !x.hidden).map((x) => x.rect);
        const thr = W * 0.012;
        const bx = snapAxis([moved.x, moved.x + moved.w / 2, moved.x + moved.w], [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])], thr);
        const by = snapAxis([moved.y, moved.y + moved.h / 2, moved.y + moved.h], [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])], thr);
        if (bx) moved.x += bx.delta;
        if (by) moved.y += by.delta;
        setGuides({ x: bx ? [bx.line] : [], y: by ? [by.line] : [] });
        onChange?.(drag.id, moved, drag.rot);
      } else {
        onChange?.(drag.id, resize(drag, dx, dy, e.shiftKey), drag.rot);
      }
    };
    const up = () => { setDrag(null); setGuides({ x: [], y: [] }); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, elements, onChange, zoom]);

  const startPan = (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    panRef.current = start;
    const move = (ev: PointerEvent) => setPan({ x: start.ox + (ev.clientX - start.px), y: start.oy + (ev.clientY - start.py) });
    const up = () => { panRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
  });

  const visible = elements.filter((e) => e.placement === placement.placement && !e.hidden);
  const cs = authoring ? 1 / zoom : 1;   // counter-scale so chrome stays a constant screen size

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
        {authoring && guides.x.map((gx, i) => <span key={`gx${i}`} className="guide gx" style={{ left: `${(gx / W) * 100}%` }} />)}
        {authoring && guides.y.map((gy, i) => <span key={`gy${i}`} className="guide gy" style={{ top: `${(gy / H) * 100}%` }} />)}
        {authoring && visible.map((el) => {
          const selected = el.id === selectedId;
          const isImg = el.kind === "image" || el.kind === "graphic";
          return (
            <div
              key={el.id}
              className="el-box"
              data-selected={selected}
              style={{ ...pct(el.rect), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              onPointerDown={(e) => {
                if (el.locked || spaceHeld) return;
                e.stopPropagation();
                onSelect?.(el.id);
                onTransformStart?.();
                setDrag({ mode: "move", id: el.id, sx: e.clientX, sy: e.clientY, rect: el.rect, rot: el.rotation ?? 0 });
              }}
            >
              {!selected && <span className="el-tag" style={{ transform: `scale(${cs})` }}>{elementLabel(el)}</span>}
              {selected && !el.locked && (
                <>
                  <div className="el-toolbar" style={{ transform: `translateX(-50%) scale(${cs})` }} onPointerDown={(e) => e.stopPropagation()}>
                    <button className="tb-btn" title="Let the customer change this" onClick={() => onAction?.("slot", el.id)}><Icon name="wand" size={15} /></button>
                    <button className="tb-btn" title="Duplicate" onClick={() => onAction?.("duplicate", el.id)}><Icon name="copy" size={15} /></button>
                    <button className="tb-btn" title="Bring forward" onClick={() => onAction?.("forward", el.id)}><Icon name="chevron-up" size={15} /></button>
                    <button className="tb-btn" title="Send back" onClick={() => onAction?.("back", el.id)}><Icon name="chevron-down" size={15} /></button>
                    <button className="tb-btn" title="Lock" onClick={() => onAction?.("lock", el.id)}><Icon name="lock" size={14} /></button>
                    <button className="tb-btn danger" title="Delete" onClick={() => onAction?.("delete", el.id)}><Icon name="trash" size={14} /></button>
                  </div>
                  <span className="el-rotate" style={{ transform: `translateX(-50%) scale(${cs})` }} title="Rotate (Shift = free)" onPointerDown={(e) => {
                    e.stopPropagation();
                    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    onTransformStart?.();
                    setDrag({ mode: "rotate", id: el.id, cx: box.left + box.width / 2, cy: box.top + box.height / 2, rect: el.rect, start: el.rotation ?? 0 });
                  }} />
                  {HANDLES.map((h) => (
                    <span key={h.id} className="el-handle" style={{ left: `${h.x}%`, top: `${h.y}%`, cursor: h.cursor, transform: `translate(-50%, -50%) scale(${cs})` }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onTransformStart?.();
                        setDrag({ mode: "resize", id: el.id, sx: e.clientX, sy: e.clientY, rect: el.rect, rot: el.rotation ?? 0, handle: h.id, aspect: isImg ? el.rect.w / el.rect.h : null });
                      }} />
                  ))}
                </>
              )}
            </div>
          );
        })}
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

/** Per-handle resize in print-file units; proportional for images/graphics (Shift frees). */
function resize(d: Extract<Drag, { mode: "resize" }>, dx: number, dy: number, shift: boolean): Rect {
  const { rect, handle } = d;
  const left = handle.includes("w"), right = handle.includes("e"), top = handle.includes("n"), bottom = handle.includes("s");
  const corner = (left || right) && (top || bottom);
  const proportional = d.aspect ? !shift : shift;

  let { x, y, w, h } = rect;
  if (proportional) {
    const ar = rect.w / rect.h;
    if (corner) {
      const nw = right ? rect.w + dx : rect.w - dx;
      const nh = bottom ? rect.h + dy : rect.h - dy;
      const scale = Math.max(nw / rect.w, nh / rect.h);
      w = Math.max(20, rect.w * scale); h = Math.max(20, w / ar);
      x = left ? rect.x + rect.w - w : rect.x;
      y = top ? rect.y + rect.h - h : rect.y;
    } else if (left || right) {
      const nw = right ? rect.w + dx : rect.w - dx;
      w = Math.max(20, nw); h = Math.max(20, w / ar);
      x = left ? rect.x + rect.w - w : rect.x;
      y = rect.y + (rect.h - h) / 2;
    } else {
      const nh = bottom ? rect.h + dy : rect.h - dy;
      h = Math.max(20, nh); w = Math.max(20, h * ar);
      y = top ? rect.y + rect.h - h : rect.y;
      x = rect.x + (rect.w - w) / 2;
    }
  } else {
    if (right) w = Math.max(20, rect.w + dx);
    if (left) { w = Math.max(20, rect.w - dx); x = rect.x + (rect.w - w); }
    if (bottom) h = Math.max(20, rect.h + dy);
    if (top) { h = Math.max(20, rect.h - dy); y = rect.y + (rect.h - h); }
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
