import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { renderArtwork, type Resolver } from "./compose";
import { Icon } from "./icons";
import type { Element, Placement, Rect, SlotValues } from "./types";

const EDITOR_SCALE = 0.4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const intersects = (a: Rect, b: Rect) =>
  !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);

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
  selectedIds?: string[];
  onSelect?: (id: string | null, additive?: boolean) => void;
  onSelectMany?: (ids: string[]) => void;
  onChange?: (id: string, rect: Rect, rotation: number) => void;
  onChangeMany?: (updates: { id: string; rect: Rect }[]) => void;
  onTransformStart?: () => void;
  onAction?: (action: string, id: string) => void;
  onDropAsset?: (id: string, pt: { x: number; y: number }) => void;
  onRemove?: (id: string) => void;
  onOverflow?: (overflow: boolean) => void;
}

type Drag =
  | { mode: "move"; id: string; sx: number; sy: number; rect: Rect; rot: number }
  | { mode: "resize"; id: string; sx: number; sy: number; rect: Rect; rot: number; handle: HandleId; aspect: number | null }
  | { mode: "rotate"; id: string; cx: number; cy: number; rect: Rect; start: number }
  | { mode: "group"; ids: string[]; sx: number; sy: number; rects: Record<string, Rect> }
  | { mode: "groupResize"; ids: string[]; sx: number; sy: number; rects: Record<string, Rect>; bbox: Rect; handle: HandleId };

function snapAxis(anchors: number[], targets: number[], thr: number): { delta: number; line: number } | null {
  let best: { delta: number; line: number } | null = null;
  for (const a of anchors) for (const t of targets) {
    const d = t - a;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: t };
  }
  return best;
}

type Badge = { cx: number; cy: number; value: number };
/** Detect equal spacing between the moving rect and its nearest neighbours on each axis. */
function equalSpacing(m: Rect, os: Rect[], thr: number): { nx?: number; ny?: number; badgesX: Badge[]; badgesY: Badge[] } {
  const badgesX: Badge[] = [], badgesY: Badge[] = [];
  let nx: number | undefined, ny: number | undefined;
  const oy = os.filter((o) => o.y < m.y + m.h && o.y + o.h > m.y);
  const L = oy.filter((o) => o.x + o.w <= m.x + 1).sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
  const R = oy.filter((o) => o.x >= m.x + m.w - 1).sort((a, b) => a.x - b.x)[0];
  if (L && R) {
    const inner = R.x - (L.x + L.w) - m.w;
    if (inner > 0) {
      const target = Math.round(L.x + L.w + inner / 2);
      if (Math.abs(target - m.x) <= thr) {
        nx = target;
        const cy = m.y + m.h / 2, gap = Math.round(inner / 2);
        badgesX.push({ cx: (L.x + L.w + target) / 2, cy, value: gap }, { cx: (target + m.w + R.x) / 2, cy, value: gap });
      }
    }
  }
  const ox = os.filter((o) => o.x < m.x + m.w && o.x + o.w > m.x);
  const T = ox.filter((o) => o.y + o.h <= m.y + 1).sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
  const B = ox.filter((o) => o.y >= m.y + m.h - 1).sort((a, b) => a.y - b.y)[0];
  if (T && B) {
    const inner = B.y - (T.y + T.h) - m.h;
    if (inner > 0) {
      const target = Math.round(T.y + T.h + inner / 2);
      if (Math.abs(target - m.y) <= thr) {
        ny = target;
        const cx = m.x + m.w / 2, gap = Math.round(inner / 2);
        badgesY.push({ cx, cy: (T.y + T.h + target) / 2, value: gap }, { cx, cy: (target + m.h + B.y) / 2, value: gap });
      }
    }
  }
  return { nx, ny, badgesX, badgesY };
}

/**
 * The product stage: the real template with the print area marked and the live composition
 * inside it. Author mode is a direct-manipulation surface (spec 07 §5-§6): living canvas with
 * zoom/pan, multi-select + marquee, 8-handle transform with proportional scaling, smart guides
 * + snapping, rotate snapping, group move, and a contextual floating toolbar. Customize mode is
 * the read-only storefront preview and is left unchanged.
 */
export function PlacementStage({
  placement, elements, values, resolver, mode,
  selectedIds = [], onSelect, onSelectMany, onChange, onChangeMany, onTransformStart, onAction, onDropAsset, onRemove, onOverflow,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [spacing, setSpacing] = useState<{ cx: number; cy: number; value: number }[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const authoring = mode === "author";
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
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

  // Keep the product in view: never let panning drift the artwork off-screen.
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const vp = viewportRef.current;
    if (!vp) return p;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    const mx = Math.max(0, (vw * z - vw) / 2) + vw * 0.25;
    const my = Math.max(0, ((vw / aspect) * z - vh) / 2) + vh * 0.25;
    return { x: clamp(p.x, -mx, mx), y: clamp(p.y, -my, my) };
  };
  const zoomTo = (next: number, d = { x: 0, y: 0 }) => {
    const { zoom: z, pan: p } = viewRef.current;
    const nz = clamp(next, 0.1, 8);
    setZoom(nz);
    setPan(clampPan({ x: d.x - ((d.x - p.x) / z) * nz, y: d.y - ((d.y - p.y) / z) * nz }, nz));
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
        setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, viewRef.current.zoom));
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

  const toFile = (dx: number, dy: number) => {
    const el = surfaceRef.current!;
    const areaW = el.clientWidth * area.width, areaH = el.clientHeight * area.height;
    const z = authoring ? zoom : 1;
    return { dx: (dx / z / areaW) * W, dy: (dy / z / areaH) * H };
  };
  const toFilePoint = (clientX: number, clientY: number) => {
    const s = surfaceRef.current!.getBoundingClientRect();
    const px = (clientX - s.left) / s.width, py = (clientY - s.top) / s.height;
    return { fx: ((px - area.left) / area.width) * W, fy: ((py - area.top) / area.height) * H };
  };

  useEffect(() => {
    if (!drag) return;
    const others = (ignore: string[]) =>
      elements.filter((x) => x.placement === placement.placement && !ignore.includes(x.id) && !x.hidden).map((x) => x.rect);
    const move = (e: PointerEvent) => {
      if (drag.mode === "rotate") {
        let ang = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI + 90;
        if (!e.shiftKey) ang = Math.round(ang / 15) * 15;
        onChange?.(drag.id, drag.rect, Math.round(ang));
        return;
      }
      const { dx, dy } = toFile(e.clientX - drag.sx, e.clientY - drag.sy);
      const thr = W * 0.012;
      if (drag.mode === "move") {
        const moved = { ...drag.rect, x: Math.round(drag.rect.x + dx), y: Math.round(drag.rect.y + dy) };
        const os = others([drag.id]);
        const gX = showGrid ? Array.from({ length: 11 }, (_, i) => (i * W) / 10) : [];
        const gY = showGrid ? Array.from({ length: 11 }, (_, i) => (i * H) / 10) : [];
        const bx = snapAxis([moved.x, moved.x + moved.w / 2, moved.x + moved.w], [0, W / 2, W, ...gX, ...os.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])], thr);
        const by = snapAxis([moved.y, moved.y + moved.h / 2, moved.y + moved.h], [0, H / 2, H, ...gY, ...os.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])], thr);
        if (bx) moved.x += bx.delta;
        if (by) moved.y += by.delta;
        setGuides({ x: bx ? [bx.line] : [], y: by ? [by.line] : [] });
        // Equal-spacing snap on axes the alignment guides didn't already claim.
        const sp = equalSpacing(moved, os, thr);
        const showX = !bx && sp.nx !== undefined, showY = !by && sp.ny !== undefined;
        if (showX) moved.x = sp.nx!;
        if (showY) moved.y = sp.ny!;
        setSpacing([...(showX ? sp.badgesX : []), ...(showY ? sp.badgesY : [])]);
        onChange?.(drag.id, moved, drag.rot);
      } else if (drag.mode === "group") {
        const rs = drag.ids.map((id) => drag.rects[id]);
        const bx0 = Math.min(...rs.map((r) => r.x)), by0 = Math.min(...rs.map((r) => r.y));
        const bw = Math.max(...rs.map((r) => r.x + r.w)) - bx0, bh = Math.max(...rs.map((r) => r.y + r.h)) - by0;
        const nx = bx0 + dx, ny = by0 + dy;
        const os = others(drag.ids);
        const sbx = snapAxis([nx, nx + bw / 2, nx + bw], [0, W / 2, W, ...os.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])], thr);
        const sby = snapAxis([ny, ny + bh / 2, ny + bh], [0, H / 2, H, ...os.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])], thr);
        const adx = dx + (sbx ? sbx.delta : 0), ady = dy + (sby ? sby.delta : 0);
        setGuides({ x: sbx ? [sbx.line] : [], y: sby ? [sby.line] : [] });
        onChangeMany?.(drag.ids.map((id) => ({ id, rect: { ...drag.rects[id], x: Math.round(drag.rects[id].x + adx), y: Math.round(drag.rects[id].y + ady) } })));
      } else if (drag.mode === "groupResize") {
        onChangeMany?.(groupResize(drag, dx, dy, e.shiftKey));
      } else {
        onChange?.(drag.id, resize(drag, dx, dy, e.shiftKey), drag.rot);
      }
    };
    const up = () => { setDrag(null); setGuides({ x: [], y: [] }); setSpacing([]); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag, elements, onChange, onChangeMany, zoom, showGrid]);

  const startPan = (e: ReactPointerEvent) => {
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y };
    panRef.current = start;
    const move = (ev: PointerEvent) => setPan(clampPan({ x: start.ox + (ev.clientX - start.px), y: start.oy + (ev.clientY - start.py) }, viewRef.current.zoom));
    const up = () => { panRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Marquee rubber-band select on empty canvas; a pure click deselects.
  const startMarquee = (e: ReactPointerEvent) => {
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
      if (!moved) return;
      const p0 = toFilePoint(sx, sy), p1 = toFilePoint(ev.clientX, ev.clientY);
      const mr = { x: Math.min(p0.fx, p1.fx), y: Math.min(p0.fy, p1.fy), w: Math.abs(p1.fx - p0.fx), h: Math.abs(p1.fy - p0.fy) };
      setMarquee(mr);
      onSelectMany?.(elements.filter((el) => el.placement === placement.placement && !el.hidden && intersects(el.rect, mr)).map((el) => el.id));
    };
    const up = () => {
      if (!moved) onSelect?.(null);
      setMarquee(null);
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
  const cs = authoring ? 1 / zoom : 1;
  const single = selectedIds.length === 1 ? selectedIds[0] : null;
  const groupBox = (() => {
    if (selectedIds.length < 2) return null;
    const rs = visible.filter((e) => selectedSet.has(e.id)).map((e) => e.rect);
    if (rs.length < 2) return null;
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  })();
  const startGroupRects = () => {
    const rects: Record<string, Rect> = {};
    for (const id of selectedIds) { const g = elements.find((x) => x.id === id); if (g) rects[id] = g.rect; }
    return rects;
  };

  const surface = (
    <div
      className="stage-surface"
      ref={surfaceRef}
      style={{
        aspectRatio: `${placement.templateWidth} / ${placement.templateHeight}`,
        backgroundColor: placement.backgroundColor ?? undefined,
        backgroundImage: `url(${placement.imageUrl})`,
      }}
      onPointerDown={(e) => { if (authoring && !spaceHeld && e.target === e.currentTarget) startMarquee(e); }}
      onDragOver={authoring && onDropAsset ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } : undefined}
      onDrop={authoring && onDropAsset ? (e) => {
        const id = e.dataTransfer.getData("text/asset-id");
        if (!id) return;
        e.preventDefault();
        const p = toFilePoint(e.clientX, e.clientY);
        onDropAsset(id, { x: p.fx, y: p.fy });
      } : undefined}
    >
      <div className="print-area" style={{ left: `${area.left * 100}%`, top: `${area.top * 100}%`, width: `${area.width * 100}%`, height: `${area.height * 100}%` }}>
        <canvas ref={canvasRef} />
        {authoring && showGrid && (
          <>
            <div className="grid-overlay" />
            {[0, 25, 50, 75, 100].map((p) => <span key={`rx${p}`} className="ruler rx" style={{ left: `${p}%`, transform: `translateX(-50%) scale(${cs})` }}>{Math.round((p / 100) * W)}</span>)}
            {[0, 25, 50, 75, 100].map((p) => <span key={`ry${p}`} className="ruler ry" style={{ top: `${p}%`, transform: `translateY(-50%) scale(${cs})` }}>{Math.round((p / 100) * H)}</span>)}
          </>
        )}
        {authoring && guides.x.map((gx, i) => <span key={`gx${i}`} className="guide gx" style={{ left: `${(gx / W) * 100}%` }} />)}
        {authoring && guides.y.map((gy, i) => <span key={`gy${i}`} className="guide gy" style={{ top: `${(gy / H) * 100}%` }} />)}
        {authoring && spacing.map((s, i) => (
          <span key={`sp${i}`} className="space-badge" style={{ left: `${(s.cx / W) * 100}%`, top: `${(s.cy / H) * 100}%`, transform: `translate(-50%, -50%) scale(${cs})` }}>{s.value}</span>
        ))}
        {authoring && marquee && <div className="marquee" style={pct(marquee)} />}
        {authoring && visible.map((el) => {
          const sel = selectedSet.has(el.id);
          const isImg = el.kind === "image" || el.kind === "graphic";
          return (
            <div
              key={el.id}
              className="el-box"
              data-selected={sel}
              style={{ ...pct(el.rect), transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              onPointerDown={(e) => {
                if (el.locked || spaceHeld) return;
                e.stopPropagation();
                if (e.shiftKey) { onSelect?.(el.id, true); return; }
                if (sel && selectedIds.length > 1) {
                  onTransformStart?.();
                  const rects: Record<string, Rect> = {};
                  for (const id of selectedIds) { const g = elements.find((x) => x.id === id); if (g) rects[id] = g.rect; }
                  setDrag({ mode: "group", ids: [...selectedIds], sx: e.clientX, sy: e.clientY, rects });
                } else {
                  onSelect?.(el.id, false);
                  onTransformStart?.();
                  setDrag({ mode: "move", id: el.id, sx: e.clientX, sy: e.clientY, rect: el.rect, rot: el.rotation ?? 0 });
                }
              }}
            >
              {single === el.id && !el.locked && (
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
        {authoring && groupBox && (
          <div className="group-box" style={pct(groupBox)}>
            {HANDLES.map((h) => (
              <span key={h.id} className="el-handle" style={{ left: `${h.x}%`, top: `${h.y}%`, cursor: h.cursor, transform: `translate(-50%, -50%) scale(${cs})` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onTransformStart?.();
                  setDrag({ mode: "groupResize", ids: [...selectedIds], sx: e.clientX, sy: e.clientY, rects: startGroupRects(), bbox: groupBox, handle: h.id });
                }} />
            ))}
          </div>
        )}
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
        <button className="mini" data-on={showGrid || undefined} title="Rulers & grid" onClick={() => setShowGrid((g) => !g)}><Icon name="ruler" size={15} /></button>
      </div>
    </div>
  );
}

/** Scale a whole multi-selection from a bounding-box handle (uniform by default, Shift frees). */
function groupResize(d: Extract<Drag, { mode: "groupResize" }>, dx: number, dy: number, shift: boolean): { id: string; rect: Rect }[] {
  const { bbox, handle, rects, ids } = d;
  const left = handle.includes("w"), right = handle.includes("e"), top = handle.includes("n"), bottom = handle.includes("s");
  const corner = (left || right) && (top || bottom);
  const nbw = bbox.w + (right ? dx : left ? -dx : 0);
  const nbh = bbox.h + (bottom ? dy : top ? -dy : 0);
  let sx = nbw / bbox.w, sy = nbh / bbox.h;
  if (corner && !shift) { const s = Math.abs(nbw - bbox.w) > Math.abs(nbh - bbox.h) ? sx : sy; sx = s; sy = s; }
  else if (!corner) { if (left || right) sy = 1; else sx = 1; }
  sx = Math.max(0.05, sx); sy = Math.max(0.05, sy);
  const ax = left ? bbox.x + bbox.w : bbox.x;
  const ay = top ? bbox.y + bbox.h : bbox.y;
  return ids.map((id) => {
    const r = rects[id];
    return { id, rect: {
      x: Math.round(ax + (r.x - ax) * sx), y: Math.round(ay + (r.y - ay) * sy),
      w: Math.max(10, Math.round(r.w * sx)), h: Math.max(10, Math.round(r.h * sy)),
    } };
  });
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
