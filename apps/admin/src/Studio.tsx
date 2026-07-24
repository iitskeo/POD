import {
  PlacementStage, SEED_ASSETS, SHAPE_ASSETS, ICONIFY_SETS, searchIconify, iconThumbUrl, fetchIconSvg,
  makeResolver, elementLabel, svgDataUrl, alignRect, slotsOf, Icon, SAMPLE_ICONS,
  type Align, type Asset, type BackgroundElement, type Element, type GraphicElement, type IconRef,
  type ImageElement, type ImageFilter, type PatternElement, type Placement, type Product, type Rect,
  type Slot, type SlotValues, type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api } from "./api";
import { useHistory } from "./history";
import { FontPicker } from "./FontPicker";
import { ColorField, GradientField } from "./ColorField";
import { getList, pushRecent, toggleFav } from "./prefs";

const COLORS = ["#0A0A0A", "#FFFFFF", "#FF5A1F", "#161616", "#F5F5F0", "#1D4ED8", "#DC2626", "#16A34A"];
const PATTERNS: PatternElement["type"][] = ["half_drop", "block", "brick", "reflect", "line_h", "line_v"];

interface Graphic { id: string; name: string; aspect: number; recolorParts: string[]; thumb: string }

/** Design Studio (spec 07 §3-§8): author the design; no pricing/publishing here. */
export function Studio({ productId, onBack }: { productId: string; onBack: () => void }) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [product, setProduct] = useState<Product | null>(null);
  const hist = useHistory([]);
  const elements = hist.elements;
  const [values, setValues] = useState<SlotValues>({});
  const [active, setActive] = useState("");
  const [variantId, setVariantId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragLayer, setDragLayer] = useState<string | null>(null);
  const [overLayer, setOverLayer] = useState<string | null>(null);
  const [panel, setPanel] = useState<"add" | "library" | "graphics">("add");
  const selectId = (id: string) => setSelectedIds([id]);
  const clearSel = () => setSelectedIds([]);
  // Clicking any grouped element selects the whole group (spec §6.6).
  const groupMembers = (id: string): string[] => {
    const el = elements.find((e) => e.id === id);
    return el?.groupId ? elements.filter((e) => e.groupId === el.groupId).map((e) => e.id) : [id];
  };
  const expandGroups = (ids: string[]): string[] => [...new Set(ids.flatMap((id) => groupMembers(id)))];
  const selectOne = (id: string | null, additive?: boolean) => {
    if (id == null) { setSelectedIds([]); return; }
    const members = groupMembers(id);
    setSelectedIds((cur) => (additive
      ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, ...members.filter((m) => !cur.includes(m))])
      : members));
  };
  const selectManyExpanded = (ids: string[]) => setSelectedIds(expandGroups(ids));
  const [status, setStatus] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [offered, setOffered] = useState<string[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; fn: () => void } } | null>(null);
  const [coachOff, setCoachOff] = useState(() => getList("dismissed").includes("coach.canvas"));
  const [tourOff, setTourOff] = useState(() => getList("dismissed").includes("tour"));
  const toastTimer = useRef<number>(0);
  const loadedRef = useRef(false);
  const notify = (msg: string, action?: { label: string; fn: () => void }) => {
    setToast({ msg, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    (async () => {
      const [p, d] = await Promise.all([api.product(productId), api.designForProduct(productId).catch(() => null)]);
      setProduct(p);
      setActive(p.placements[0]?.placement ?? "");
      setVariantId(p.externalVariantId ? Number(p.externalVariantId) : p.variants[0]?.id ?? null);
      setOffered(p.offeredVariantColors);
      if (d) hist.reset(d.elements);
      loadedRef.current = true;
    })().catch((e) => setStatus(String(e.message ?? e)));
    api.listAssets().then(setAssets).catch(() => {});
  }, [productId]);

  useEffect(() => {
    const v: SlotValues = {};
    for (const el of elements) if (el.kind === "text" && el.editable) v[el.id] = el.content || "Sample";
    setValues(v);
  }, [elements]);

  const graphics: Graphic[] = useMemo(() => [
    ...SHAPE_ASSETS.map((a) => ({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: ["shape"], thumb: svgDataUrl(a.svg) })),
    ...SEED_ASSETS.map((a) => ({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: a.recolorParts, thumb: svgDataUrl(a.svg) })),
    ...assets.map((a) => ({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: a.recolorParts, thumb: api.assetFileUrl(a.id) })),
  ], [assets]);
  const graphicById = (id: string) => graphics.find((g) => g.id === id);

  const placements: Placement[] = useMemo(() => {
    if (!product) return [];
    const vt = variantId != null ? product.variantTemplates?.[variantId] : null;
    return vt ?? product.placements;
  }, [product, variantId]);
  const placement = placements.find((p) => p.placement === active) ?? placements[0];
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<Element>) =>
    hist.commit((els) => els.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)), `prop:${id}`);
  const remove = (id: string) => { hist.commit((els) => els.filter((e) => e.id !== id)); clearSel(); notify("Element deleted", { label: "Undo", fn: hist.undo }); };
  const uid = () => crypto.randomUUID().slice(0, 8);
  const nextZ = () => Math.max(0, ...elements.map((e) => e.z)) + 1;
  const centerRect = (w: number, h: number): Rect => {
    const sp = placement.printSpec;
    return { x: Math.round(sp.widthPx / 2 - w / 2), y: Math.round(sp.heightPx / 2 - h / 2), w, h };
  };

  const addText = () => {
    const sp = placement.printSpec;
    const el: TextElement = {
      id: uid(), kind: "text", placement: active, rect: centerRect(Math.round(sp.widthPx * 0.7), Math.round(sp.heightPx * 0.15)),
      z: nextZ(), content: "Your text", font: "Space Grotesk", color: "#0A0A0A", align: "center",
      maxLines: 2, minSizeFrac: 0.05, maxChars: 20, editable: false,
    };
    hist.commit((e) => [...e, el]); selectId(el.id);
  };
  const addGraphicAt = (g: Graphic, cx: number, cy: number) => {
    const sp = placement.printSpec;
    const h = Math.round(sp.heightPx * 0.3), w = Math.round(h * g.aspect);
    const el: GraphicElement = { id: uid(), kind: "graphic", placement: active, rect: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h }, z: nextZ(), assetId: g.id };
    hist.commit((e) => [...e, el]); selectId(el.id);
  };
  const addGraphic = (g: Graphic) => {
    const sp = placement.printSpec;
    addGraphicAt(g, sp.widthPx / 2, sp.heightPx / 2);
  };
  const onDropAsset = (id: string, pt: { x: number; y: number }) => { const g = graphics.find((x) => x.id === id); if (g) addGraphicAt(g, pt.x, pt.y); };
  const addUpload = async (file: File) => {
    setStatus("Uploading…");
    try {
      const { uploadId, aspect } = await api.upload(file);
      const sp = placement.printSpec;
      const h = Math.round(sp.heightPx * 0.4), w = Math.round(h * (aspect || 1));
      const el: ImageElement = { id: uid(), kind: "image", placement: active, rect: centerRect(w, h), z: nextZ(), storageKey: uploadId, aspect: aspect || 1 };
      hist.commit((e) => [...e, el]); selectId(el.id); setStatus("");
    } catch (e) { setStatus(`Upload failed: ${e instanceof Error ? e.message : e}`); }
  };
  const addAssetFile = async (file: File) => {
    setStatus("Uploading graphic…");
    try { const a = await api.createAsset(file, file.name.replace(/\.[^.]+$/, "")); setAssets((s) => [a, ...s]); setStatus(""); }
    catch (e) { setStatus(`Failed: ${e instanceof Error ? e.message : e}`); }
  };
  /** Import a searched icon into the owner's library and place it. */
  const importIcon = async (ref: IconRef) => {
    setStatus(`Adding ${ref.name}…`);
    try {
      const svg = await fetchIconSvg(ref);
      const file = new File([svg], `${ref.name}.svg`, { type: "image/svg+xml" });
      const a = await api.createAsset(file, ref.name, "library");
      setAssets((s) => [a, ...s]);
      addGraphic({ id: a.id, name: a.name, aspect: a.aspect, recolorParts: a.recolorParts, thumb: api.assetFileUrl(a.id) });
      setStatus("");
    } catch (e) { setStatus(`Failed: ${e instanceof Error ? e.message : e}`); }
  };
  const addBackground = () => {
    const el: BackgroundElement = { id: uid(), kind: "background", placement: active, rect: { x: 0, y: 0, w: placement.printSpec.widthPx, h: placement.printSpec.heightPx }, z: 0, fill: { color: "#FF5A1F" } };
    hist.commit((e) => [el, ...e.map((x) => ({ ...x, z: x.z + 1 }))]); selectId(el.id);
  };

  const reorder = (id: string, dir: -1 | 1) => hist.commit((els) => {
    const same = els.filter((e) => e.placement === active).sort((a, b) => a.z - b.z);
    const i = same.findIndex((e) => e.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= same.length) return els;
    const zi = same[i].z, zj = same[j].z;
    return els.map((e) => e.id === same[i].id ? { ...e, z: zj } : e.id === same[j].id ? { ...e, z: zi } : e);
  });
  // Drag-to-reorder: move one layer to another's slot and re-number z on this placement.
  const reorderLayers = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ordered = elements.filter((e) => e.placement === active).sort((a, b) => b.z - a.z);
    const from = ordered.findIndex((e) => e.id === fromId), to = ordered.findIndex((e) => e.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const zById: Record<string, number> = {};
    next.forEach((e, i) => { zById[e.id] = next.length - i; });
    hist.commit((els) => els.map((e) => (zById[e.id] !== undefined ? { ...e, z: zById[e.id] } : e)));
  };
  const duplicate = (id: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    const copy = { ...el, id: uid(), z: nextZ(), rect: { ...el.rect, x: el.rect.x + 40, y: el.rect.y + 40 } } as Element;
    hist.commit((e) => [...e, copy]); selectId(copy.id);
  };
  const duplicateTo = (id: string, target: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    const copy = { ...el, id: uid(), placement: target } as Element;
    hist.commit((e) => [...e, copy]);
  };

  // Align: one element snaps to the canvas; multiple align to the selection's bounding box.
  const align = (a: Align) => {
    const sel = elements.filter((e) => selectedIds.includes(e.id));
    if (!sel.length) return;
    if (sel.length === 1) { update(sel[0].id, { rect: alignRect(sel[0].rect, a, placement.printSpec.widthPx, placement.printSpec.heightPx) }); return; }
    const bx = Math.min(...sel.map((e) => e.rect.x)), by = Math.min(...sel.map((e) => e.rect.y));
    const br = Math.max(...sel.map((e) => e.rect.x + e.rect.w)), bb = Math.max(...sel.map((e) => e.rect.y + e.rect.h));
    hist.commit((els) => els.map((e) => {
      if (!selectedIds.includes(e.id)) return e;
      const r = { ...e.rect };
      if (a === "left") r.x = bx; else if (a === "right") r.x = br - r.w;
      else if (a === "hcenter") r.x = Math.round((bx + br) / 2 - r.w / 2);
      else if (a === "top") r.y = by; else if (a === "bottom") r.y = bb - r.h;
      else if (a === "vcenter") r.y = Math.round((by + bb) / 2 - r.h / 2);
      return { ...e, rect: r };
    }));
  };
  // Distribute selected elements to equal spacing between the outermost two (needs 3+).
  const distribute = (axis: "h" | "v") => {
    const sel = elements.filter((e) => selectedIds.includes(e.id));
    if (sel.length < 3) return;
    const k: keyof Rect = axis === "h" ? "x" : "y";
    const sz: keyof Rect = axis === "h" ? "w" : "h";
    const sorted = [...sel].sort((a, b) => (a.rect[k] + a.rect[sz] / 2) - (b.rect[k] + b.rect[sz] / 2));
    const c0 = sorted[0].rect[k] + sorted[0].rect[sz] / 2;
    const c1 = sorted[sorted.length - 1].rect[k] + sorted[sorted.length - 1].rect[sz] / 2;
    const step = (c1 - c0) / (sorted.length - 1);
    const target: Record<string, number> = {};
    sorted.forEach((e, i) => { target[e.id] = c0 + step * i; });
    hist.commit((els) => els.map((e) => {
      if (target[e.id] === undefined) return e;
      const r = { ...e.rect }; r[k] = Math.round(target[e.id] - r[sz] / 2);
      return { ...e, rect: r };
    }));
  };

  // Live transforms from the canvas (no history until the gesture starts).
  const canvasChange = (id: string, rect: Rect, rotation: number) =>
    hist.set((els) => els.map((e) => (e.id === id ? ({ ...e, rect, rotation } as Element) : e)));
  const canvasChangeMany = (updates: { id: string; rect: Rect }[]) =>
    hist.set((els) => els.map((e) => { const u = updates.find((x) => x.id === e.id); return u ? ({ ...e, rect: u.rect } as Element) : e; }));

  // Selection-wide actions (spec §6.5/§6.6).
  const removeSel = () => {
    if (!selectedIds.length) return;
    const n = selectedIds.length;
    hist.commit((els) => els.filter((e) => !selectedIds.includes(e.id))); clearSel();
    notify(n === 1 ? "Element deleted" : `${n} elements deleted`, { label: "Undo", fn: hist.undo });
  };
  const duplicateSel = () => {
    if (!selectedIds.length) return;
    const copies = elements.filter((e) => selectedIds.includes(e.id)).map((e, i) => ({ ...e, id: uid(), z: nextZ() + i, rect: { ...e.rect, x: e.rect.x + 40, y: e.rect.y + 40 } } as Element));
    hist.commit((e) => [...e, ...copies]); setSelectedIds(copies.map((c) => c.id));
  };
  const nudgeSel = (dx: number, dy: number) => {
    hist.snapshot(`nudge:${selectedIds.join(",")}`);
    hist.set((els) => els.map((el) => (selectedIds.includes(el.id) ? ({ ...el, rect: { ...el.rect, x: el.rect.x + dx, y: el.rect.y + dy } } as Element) : el)));
  };
  const groupSel = () => {
    if (selectedIds.length < 2) return;
    const gid = uid();
    hist.commit((els) => els.map((e) => (selectedIds.includes(e.id) ? ({ ...e, groupId: gid } as Element) : e)));
  };
  const ungroupSel = () => hist.commit((els) => els.map((e) => (selectedIds.includes(e.id) ? ({ ...e, groupId: undefined } as Element) : e)));
  // The group id if the whole selection shares one non-empty group, else null.
  const selGroupId = (() => {
    if (!selectedIds.length) return null;
    const first = elements.find((e) => e.id === selectedIds[0])?.groupId;
    return first && selectedIds.every((id) => elements.find((e) => e.id === id)?.groupId === first) ? first : null;
  })();

  // One-gesture slot creation (spec §6.4 / §12): make the element customer-editable.
  const makeSlot = (id: string) => {
    const el = elements.find((e) => e.id === id); if (!el) return;
    if (el.kind === "text") update(id, { editable: true, textLabel: el.textLabel ?? "Your text" } as Partial<Element>);
    else if (el.kind === "graphic" && !el.choiceSlot) update(id, { choiceSlot: { label: "Choose image", options: [el.assetId] } } as Partial<Element>);
    else if (el.kind === "image" && !el.choiceSlot) update(id, { choiceSlot: { label: "Choose image", options: [el.storageKey] } } as Partial<Element>);
    selectId(id);
  };

  // Contextual floating-toolbar actions (spec §6.4).
  const onAction = (action: string, id: string) => {
    if (action === "duplicate") duplicate(id);
    else if (action === "delete") remove(id);
    else if (action === "forward") reorder(id, 1);
    else if (action === "back") reorder(id, -1);
    else if (action === "slot") makeSlot(id);
    else if (action === "lock") { const el = elements.find((e) => e.id === id); if (el) update(id, { locked: !el.locked }); }
  };

  // Keyboard shortcuts (spec §6.5).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (mod && k === "y") { e.preventDefault(); hist.redo(); return; }
      if (typing) return;
      if (mod && k === "a") { e.preventDefault(); setSelectedIds(elements.filter((el) => el.placement === active).map((el) => el.id)); return; }
      if (mod && (e.key === "]" || e.key === "[")) { e.preventDefault(); selectedIds.forEach((id) => reorder(id, e.key === "]" ? 1 : -1)); return; }
      if (mod && k === "g") { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); return; }
      if (mod && k === "d" && selectedIds.length) { e.preventDefault(); duplicateSel(); return; }
      if (k === "escape") { clearSel(); return; }
      if (selectedIds.length && (e.key === "Delete" || e.key === "Backspace")) { e.preventDefault(); removeSel(); return; }
      if (selectedIds.length && placement && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const base = Math.max(1, Math.round(placement.printSpec.widthPx * 0.003)) * (e.shiftKey ? 10 : 1);
        const dx = e.key === "ArrowLeft" ? -base : e.key === "ArrowRight" ? base : 0;
        const dy = e.key === "ArrowUp" ? -base : e.key === "ArrowDown" ? base : 0;
        nudgeSel(dx, dy);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, elements, placement, active]);

  const persist = async () => {
    if (!product) return;
    setSaveState("saving");
    try {
      await api.saveDesign({ id: `design-${productId}`, productId, name: product.name, status: product.status ?? "draft", elements });
      const up = await api.patchProduct(productId, { offeredVariantColors: offered });
      setProduct(up);
      setSaveState("saved");
    } catch (e) { setSaveState("error"); setStatus(`Error: ${e instanceof Error ? e.message : e}`); }
  };
  // Autosave (spec §14): debounce changes; the manual Save button stays for reassurance.
  useEffect(() => {
    if (!loadedRef.current || !product) return;
    const t = setTimeout(() => { persist(); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, offered]);

  const dismissCoach = () => { toggleFav("dismissed", "coach.canvas"); setCoachOff(true); };

  if (!product || !placement) return <StudioSkeleton />;
  const countFor = (pl: string) => elements.filter((e) => e.placement === pl).length;
  const otherPlacements = placements.map((p) => p.placement).filter((p) => p !== active);
  const colors = product.variants.filter((v, i, a) => a.findIndex((x) => x.color === v.color) === i);
  const isOffered = (c: string | null) => offered === null || (c != null && offered.includes(c));
  const toggleOffered = (c: string | null) => {
    if (c == null) return;
    setOffered((cur) => {
      const base = cur ?? colors.map((v) => v.color).filter((x): x is string => x != null);
      const next = base.includes(c) ? base.filter((x) => x !== c) : [...base, c];
      return next;
    });
  };
  const slots = slotsOf(elements);

  return (
    <div className="studio">
      <div className="studio-bar">
        <button className="btn" onClick={onBack}><Icon name="arrow-left" size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />Create Products</button>
        <strong className="cname">{product.name}</strong>
        <div className="placement-tabs">
          {placements.map((pl) => (
            <button key={pl.placement} data-on={pl.placement === active} onClick={() => { setActive(pl.placement); clearSel(); }}>
              {pl.placement}{countFor(pl.placement) > 0 && <span className="badge">{countFor(pl.placement)}</span>}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="garment-colors" title="Garment color">
          {colors.map((v) => (
            <button key={v.id} className="gsw" data-on={v.id === variantId}
              style={{ background: v.colorCode ?? "#888" }}
              title={v.color ?? `Variant ${v.id}`} onClick={() => setVariantId(v.id)} />
          ))}
        </div>
        <div className="bar-group">
          <button className="icon-btn" title="Undo (Cmd/Ctrl+Z)" disabled={!hist.canUndo} onClick={hist.undo}><Icon name="undo-2" size={17} /></button>
          <button className="icon-btn" title="Redo (Shift+Cmd/Ctrl+Z)" disabled={!hist.canRedo} onClick={hist.redo}><Icon name="redo-2" size={17} /></button>
        </div>
        <span className="hint save-state" data-s={saveState}>{status || (saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "")}</span>
        <button className="cta" onClick={persist}><Icon name="check" size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />Save</button>
      </div>

      <div className="studio-grid">
        <aside className="rail-shell">
          <nav className="rail-icons">
            <button className="rail-ico" data-on={panel === "add"} title="Add" onClick={() => setPanel("add")}><Icon name="plus" size={19} /></button>
            <button className="rail-ico" data-on={panel === "library"} title="Shapes & icons library" onClick={() => setPanel("library")}><Icon name="search" size={19} /></button>
            <button className="rail-ico" data-on={panel === "graphics"} title="My graphics" onClick={() => setPanel("graphics")}><Icon name="image" size={19} /></button>
          </nav>
          <div className="rail-body">
            <div className="rail-panel">
              {panel === "add" && (
                <>
                  <span className="eyebrow">Add</span>
                  <button className="btn wide" onClick={addText}><Icon name="type" size={15} style={{ marginRight: 8, verticalAlign: "-2px" }} />Text</button>
                  <label className="btn wide file">Upload image<input type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => e.target.files?.[0] && addUpload(e.target.files[0])} /></label>
                  <button className="btn wide" onClick={addBackground}><Icon name="square" size={15} style={{ marginRight: 8, verticalAlign: "-2px" }} />Background fill</button>
                </>
              )}
              {panel === "library" && <LibrarySearch onPick={importIcon} />}
              {panel === "graphics" && <GraphicsPanel graphics={graphics} onAdd={addGraphic} onUpload={addAssetFile} />}
            </div>

          <span className="eyebrow" style={{ marginTop: 14 }}>Layers</span>
          {(() => {
            const seen = new Map<string, number>();
            elements.filter((e) => e.placement === active && e.groupId).forEach((e) => seen.set(e.groupId!, (seen.get(e.groupId!) || 0) + 1));
            const groups = [...seen.entries()];
            if (!groups.length) return null;
            return (
              <div className="groups-list">
                {groups.map(([gid, count], i) => {
                  const members = elements.filter((e) => e.groupId === gid).map((e) => e.id);
                  const on = members.length > 0 && members.every((m) => selectedIds.includes(m));
                  return (
                    <div key={gid} className="layers-group" data-on={on || undefined}>
                      <span className="grip"><Icon name="group" size={13} /></span>
                      <button className="lname" onClick={() => setSelectedIds(members)}>Group {i + 1} · {count} items</button>
                      <button className="mini" title="Ungroup" onClick={() => hist.commit((els) => els.map((e) => (e.groupId === gid ? ({ ...e, groupId: undefined } as Element) : e)))}><Icon name="x" size={13} /></button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <ul className="layers">
            {[...elements].filter((e) => e.placement === active).sort((a, b) => b.z - a.z).map((el) => (
              <li key={el.id} data-on={selectedIds.includes(el.id)} data-over={overLayer === el.id || undefined} data-grouped={!!el.groupId || undefined} draggable
                onDragStart={(e) => { setDragLayer(el.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { e.preventDefault(); if (dragLayer && overLayer !== el.id) setOverLayer(el.id); }}
                onDrop={(e) => { e.preventDefault(); if (dragLayer) reorderLayers(dragLayer, el.id); setDragLayer(null); setOverLayer(null); }}
                onDragEnd={() => { setDragLayer(null); setOverLayer(null); }}>
                <span className="grip" title="Drag to reorder"><Icon name="grip" size={14} /></span>
                <button className="lname" onClick={(e) => selectOne(el.id, e.shiftKey)}>{elementLabel(el)}</button>
                <button className="mini" data-on={el.locked || undefined} title={el.locked ? "Unlock" : "Lock"} onClick={() => update(el.id, { locked: !el.locked })}><Icon name={el.locked ? "lock" : "unlock"} size={14} /></button>
                <button className="mini" title={el.hidden ? "Show" : "Hide"} onClick={() => update(el.id, { hidden: !el.hidden })}><Icon name={el.hidden ? "eye-off" : "eye"} size={14} /></button>
                <button className="mini" title="Duplicate" onClick={() => duplicate(el.id)}><Icon name="copy" size={14} /></button>
                {otherPlacements.length > 0 && (
                  <select className="dupsel" title="Duplicate to placement" value="" onChange={(e) => { if (e.target.value) duplicateTo(el.id, e.target.value); e.target.value = ""; }}>
                    <option value="">Copy to…</option>{otherPlacements.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
                <button className="mini" title="Delete" onClick={() => remove(el.id)}><Icon name="trash" size={14} /></button>
              </li>
            ))}
            {countFor(active) === 0 && <li className="empty">No elements</li>}
          </ul>
          </div>
        </aside>

        <main className="stage-wrap">
          {selectedIds.length > 0 && (
            <div className="align-bar">
              <span className="eyebrow">{selectedIds.length > 1 ? `${selectedIds.length} selected · align` : "Align"}</span>
              <button className="mini" title="Left" onClick={() => align("left")}><Icon name="align-left" size={15} /></button>
              <button className="mini" title="H-center" onClick={() => align("hcenter")}><Icon name="move-horizontal" size={15} /></button>
              <button className="mini" title="Right" onClick={() => align("right")}><Icon name="align-right" size={15} /></button>
              <button className="mini" title="Top" onClick={() => align("top")}><Icon name="arrow-up-line" size={15} /></button>
              <button className="mini" title="V-center" onClick={() => align("vcenter")}><Icon name="move-vertical" size={15} /></button>
              <button className="mini" title="Bottom" onClick={() => align("bottom")}><Icon name="arrow-down-line" size={15} /></button>
              {selectedIds.length > 2 && <>
                <span className="align-sep" />
                <button className="mini" title="Distribute horizontally" onClick={() => distribute("h")}><Icon name="move-horizontal" size={15} /></button>
                <button className="mini" title="Distribute vertically" onClick={() => distribute("v")}><Icon name="move-vertical" size={15} /></button>
              </>}
              {selectedIds.length > 1 && <>
                <span className="align-sep" />
                {selGroupId
                  ? <button className="mini" data-on title="Ungroup (Shift+Cmd/Ctrl+G)" onClick={ungroupSel}><Icon name="group" size={15} /></button>
                  : <button className="mini" title="Group (Cmd/Ctrl+G)" onClick={groupSel}><Icon name="group" size={15} /></button>}
              </>}
            </div>
          )}
          <div className="stage-stack">
            <PlacementStage placement={placement} elements={elements} values={values} resolver={resolver}
              mode="author" selectedIds={selectedIds} onSelect={selectOne} onSelectMany={selectManyExpanded}
              onChange={canvasChange} onChangeMany={canvasChangeMany} onTransformStart={() => hist.snapshot()} onAction={onAction} onDropAsset={onDropAsset} />
            {selected && !coachOff && (
              <div className="coach">
                <span>Drag a corner to resize · hold <b>Shift</b> to free-scale · drag a box on empty canvas to multi-select</span>
                <button className="mini" title="Got it" onClick={dismissCoach}><Icon name="x" size={14} /></button>
              </div>
            )}
          </div>
          <p className="hint">Anything outside the light area isn't printed. Shift-click or drag a box to select several. Live preview = flat design-on-template; photoreal mockups are generated when you publish.</p>
        </main>

        <aside className="props">
          <span className="eyebrow">Properties</span>
          {!selected && <p className="hint">{selectedIds.length > 1 ? `${selectedIds.length} elements selected — align, distribute, move or delete them together.` : "Select an element to edit it."}</p>}
          {selected && (
            <label className="field"><span className="hint">Opacity · {Math.round((selected.opacity ?? 1) * 100)}%</span>
              <input type="range" min={0} max={1} step={0.01} value={selected.opacity ?? 1} onChange={(e) => update(selected.id, { opacity: Number(e.target.value) })} />
            </label>
          )}
          {selected?.kind === "text" && <TextProps el={selected} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "graphic" && <GraphicProps el={selected} parts={graphicById(selected.assetId)?.recolorParts ?? []} graphics={graphics} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "image" && <ImageProps el={selected} onChange={(p) => update(selected.id, p)}
            addOption={async (file) => { try { const { uploadId } = await api.upload(file); return uploadId; } catch { return null; } }}
            onPattern={() => {
              const el = selected as ImageElement;
              const pat: PatternElement = { id: el.id, kind: "pattern", placement: el.placement, rect: { x: 0, y: 0, w: placement.printSpec.widthPx, h: placement.printSpec.heightPx }, z: el.z, source: { storageKey: el.storageKey }, type: "half_drop", scale: 1, spacing: 20 };
              update(el.id, pat as unknown as Partial<Element>);
            }} />}
          {selected?.kind === "pattern" && <PatternProps el={selected} onChange={(p) => update(selected.id, p)} />}
          {selected?.kind === "background" && <BackgroundProps el={selected} graphics={graphics} onChange={(p) => update(selected.id, p)} />}

          <CustomerFills slots={slots} onSelect={selectId} />

          <div className="pgroup">
            <span className="eyebrow">Colors offered to customers</span>
            <p className="hint">Tick the garment colors shoppers can pick. All sizes are always offered.</p>
            <div className="swatches">
              {colors.map((v) => (
                <button key={v.id} className="sw" data-on={isOffered(v.color)}
                  style={{ background: v.colorCode ?? "#888", opacity: isOffered(v.color) ? 1 : 0.35 }}
                  title={v.color ?? ""} onClick={() => toggleOffered(v.color)} />
              ))}
            </div>
            <p className="hint">{offered === null ? "All colors offered" : `${offered.length} offered`}</p>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.action && <button className="toast-action" onClick={() => { toast.action!.fn(); setToast(null); }}>{toast.action.label}</button>}
        </div>
      )}
      {!tourOff && <StudioTour onClose={() => { toggleFav("dismissed", "tour"); setTourOff(true); }} />}
    </div>
  );
}

/** First-run tour (spec §13) — a short overlay on first entry to the studio. */
function StudioTour({ onClose }: { onClose: () => void }) {
  const STEPS = [
    { title: "Welcome to the Studio", body: "Design your product on a living canvas. Here's a 20-second tour — skip anytime." },
    { title: "The canvas", body: "Zoom with Ctrl/Cmd-scroll, pan by holding Space and dragging, and switch garment colours from the top bar. Toggle rulers & grid from the zoom control." },
    { title: "Add anything", body: "The icon rail on the left switches panels: add text or a background, browse the icon library, drop in your graphics, or start from a template. Drag a graphic straight onto the canvas." },
    { title: "Direct manipulation", body: "Drag to move, use the eight handles to resize, and the floating toolbar for quick actions. Smart guides and spacing badges keep everything aligned. Cmd/Ctrl+Z undoes anything." },
    { title: "It saves itself", body: "Changes autosave as you work. Mark any element “customer can change” to turn it into a slot. Pricing and publishing live in My Products." },
  ];
  const [i, setI] = useState(0);
  const step = STEPS[i], last = i === STEPS.length - 1;
  return (
    <div className="tour-backdrop">
      <div className="tour-card">
        <span className="eyebrow">Step {i + 1} of {STEPS.length}</span>
        <h3>{step.title}</h3>
        <p className="hint">{step.body}</p>
        <div className="tour-dots">{STEPS.map((_, j) => <span key={j} data-on={j === i || undefined} />)}</div>
        <div className="tour-actions">
          <button className="btn ghost" onClick={onClose}>Skip</button>
          <div className="spacer" />
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button className="cta" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "Start designing" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

/** Loading skeleton for the studio (spec §14) — never a frozen empty frame. */
function StudioSkeleton() {
  return (
    <div className="studio">
      <div className="studio-bar"><span className="sk sk-line" style={{ width: 160 }} /><div className="spacer" /><span className="sk sk-line" style={{ width: 90 }} /></div>
      <div className="studio-grid">
        <aside className="rail">{Array.from({ length: 5 }).map((_, i) => <span key={i} className="sk sk-block" />)}</aside>
        <main className="stage-wrap"><div className="sk sk-stage" /></main>
        <aside className="props">{Array.from({ length: 4 }).map((_, i) => <span key={i} className="sk sk-block" />)}</aside>
      </div>
    </div>
  );
}

/** Owner graphics: search, favorites, recents, drag-to-canvas (spec §7). */
function GraphicsPanel({ graphics, onAdd, onUpload }: { graphics: Graphic[]; onAdd: (g: Graphic) => void; onUpload: (f: File) => void }) {
  const [q, setQ] = useState("");
  const [fav, setFav] = useState<string[]>(() => getList("fav.graphics"));
  const [recent, setRecent] = useState<string[]>(() => getList("recent.graphics"));
  const add = (g: Graphic) => { setRecent(pushRecent("recent.graphics", g.id)); onAdd(g); };
  const star = (id: string, e: ReactMouseEvent) => { e.stopPropagation(); setFav(toggleFav("fav.graphics", id)); };
  const byId = (id: string) => graphics.find((g) => g.id === id);
  const term = q.trim().toLowerCase();
  const filtered = term ? graphics.filter((g) => g.name.toLowerCase().includes(term)) : graphics;

  const tile = (g: Graphic) => (
    <div key={g.id} className="asset-cell">
      <button className="asset-btn" title={g.name} draggable
        onDragStart={(e) => { e.dataTransfer.setData("text/asset-id", g.id); e.dataTransfer.effectAllowed = "copy"; }}
        onClick={() => add(g)}><img src={g.thumb} alt={g.name} /></button>
      <button className="star mini" data-on={fav.includes(g.id) || undefined} title="Favorite" onClick={(e) => star(g.id, e)}><Icon name="star" size={12} /></button>
    </div>
  );

  return (
    <div className="library">
      <div className="section-head"><span className="eyebrow">My graphics</span>
        <label className="mini file" title="Upload a graphic to your library"><Icon name="plus" size={15} /><input type="file" accept="image/svg+xml,image/png" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /></label></div>
      <input className="lib-search" placeholder="Search graphics…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!term && fav.length > 0 && <><span className="eyebrow sub">Favorites</span><div className="asset-grid">{fav.map(byId).filter((g): g is Graphic => !!g).map(tile)}</div></>}
      {!term && recent.length > 0 && <><span className="eyebrow sub">Recent</span><div className="asset-grid">{recent.map(byId).filter((g): g is Graphic => !!g).map(tile)}</div></>}
      {!term && (fav.length > 0 || recent.length > 0) && <span className="eyebrow sub">All</span>}
      <div className="asset-grid">{filtered.map(tile)}</div>
      {filtered.length === 0 && <p className="hint">No graphics match “{q}”.</p>}
    </div>
  );
}

/** The searchable provided library (Iconify + shapes), spec §4/§8, with recently-used (§7). */
function LibrarySearch({ onPick }: { onPick: (ref: IconRef) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IconRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<IconRef[]>(() => getList("recent.icons").map((s) => { try { return JSON.parse(s) as IconRef; } catch { return null; } }).filter((r): r is IconRef => !!r));
  const pick = (ref: IconRef) => { setRecent(pushRecent("recent.icons", JSON.stringify(ref)).map((s) => JSON.parse(s) as IconRef)); onPick(ref); };

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    let stale = false;
    setBusy(true);
    const t = setTimeout(() => {
      searchIconify(term).then((r) => { if (!stale) setResults(r); }).catch(() => {}).finally(() => { if (!stale) setBusy(false); });
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [q]);

  const grid = (refs: IconRef[]) => (
    <div className="asset-grid lib-grid">
      {refs.map((ref) => (
        <button key={ref.id} className={`asset-btn${ref.colored ? " colored" : ""}`} title={ref.name} onClick={() => pick(ref)}>
          <img src={iconThumbUrl(ref)} alt={ref.name} loading="lazy" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="library">
      <span className="eyebrow">Shapes & icons library</span>
      <input className="lib-search" placeholder="Search icons (car, star, leaf…)" value={q} onChange={(e) => setQ(e.target.value)} />
      {busy && <p className="hint">Searching…</p>}
      {results.length > 0 && grid(results)}
      {q && !busy && results.length === 0 && <p className="hint">No matches in the provided sets.</p>}
      {!q && recent.length > 0 && <><span className="eyebrow sub">Recently used</span>{grid(recent)}</>}
      {!q && <><span className="eyebrow sub">Examples</span>{grid(SAMPLE_ICONS)}
        <p className="hint">{ICONIFY_SETS.length} open icon sets · type to search 200k+ icons.</p></>}
    </div>
  );
}

/** "What the customer fills" summary panel (spec §7.2). */
function CustomerFills({ slots, onSelect }: { slots: Slot[]; onSelect: (id: string) => void }) {
  const describe = (s: Slot) =>
    s.kind === "text" ? `Text "${s.label}"`
      : s.kind === "image" ? `Image "${s.label}" — pick 1 of ${s.options.length}`
      : s.kind === "graphic" ? `Graphic "${s.label}" — pick 1 of ${s.options.length}`
      : `Color "${s.label}" — pick 1 of ${s.options.length}`;
  return (
    <div className="pgroup fills">
      <span className="eyebrow">What the customer fills</span>
      {slots.length === 0 && <p className="hint">Nothing yet — mark an element as a customer slot to let shoppers change it.</p>}
      <ul className="fills-list">
        {slots.map((s) => (
          <li key={`${s.elementId}.${s.kind}`}>
            <button className="lname" onClick={() => onSelect(s.elementId)}>{describe(s)}</button>
            <span className="req">required</span>
          </li>
        ))}
      </ul>
      {slots.length > 0 && <p className="hint">{slots.length} required {slots.length === 1 ? "choice" : "choices"} before add-to-cart.</p>}
    </div>
  );
}

function TextProps({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  return (
    <div className="pgroup">
      <label className="field"><span className="hint">Text</span><input value={el.content} onChange={(e) => onChange({ content: e.target.value })} /></label>
      <div className="field"><span className="hint">Font</span><FontPicker value={el.font} onChange={(font) => onChange({ font })} /></div>
      <div className="field"><span className="hint">Align</span>
        <div className="seg">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} data-on={el.align === a} onClick={() => onChange({ align: a })}>
              <Icon name={a === "left" ? "align-left" : a === "center" ? "align-center" : "align-right"} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="field row">
        <label><span className="hint">Weight</span><select value={el.weight ?? 700} onChange={(e) => onChange({ weight: Number(e.target.value) })}>
          <option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extrabold</option>
        </select></label>
        <label><span className="hint">Case</span><select value={el.case ?? "none"} onChange={(e) => onChange({ case: e.target.value === "none" ? undefined : (e.target.value as TextElement["case"]) })}>
          <option value="none">Aa Normal</option><option value="upper">UPPERCASE</option><option value="title">Title Case</option><option value="lower">lowercase</option>
        </select></label>
      </div>
      <ColorField label="Color" value={el.color} palette={COLORS} onChange={(color) => onChange({ color })} />
      <GradientField value={el.gradient} onChange={(gradient) => onChange({ gradient })} />
      <TextEffectPresets el={el} onChange={onChange} />
      <div className="field row">
        <label><span className="hint">Letter spacing</span><input type="number" value={el.letterSpacing ?? 0} onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })} /></label>
        <label><span className="hint">Line height</span><input type="number" step="0.05" value={el.lineHeight ?? 1.15} onChange={(e) => onChange({ lineHeight: Number(e.target.value) })} /></label>
      </div>
      <div className="field row">
        <label><span className="hint">Arc °</span><input type="number" value={el.arc ?? 0} onChange={(e) => onChange({ arc: Number(e.target.value) })} /></label>
        <label><span className="hint">Max lines</span><input type="number" value={el.maxLines} onChange={(e) => onChange({ maxLines: Math.max(1, Number(e.target.value)) })} /></label>
      </div>
      <div className="field"><span className="hint">Lockup</span>
        <div className="preset-row">
          <button className="preset" onClick={() => onChange({ arc: 0, maxLines: 1 })}>Flat</button>
          <button className="preset" onClick={() => onChange({ arc: 0, maxLines: 3, lineHeight: 1 })}>Stacked</button>
          <button className="preset" onClick={() => onChange({ arc: 120, maxLines: 1 })}>Arc up</button>
          <button className="preset" onClick={() => onChange({ arc: -120, maxLines: 1 })}>Arc down</button>
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={!!el.outline} onChange={(e) => onChange({ outline: e.target.checked ? { color: "#0A0A0A", width: 6 } : undefined })} /> Outline</label>
      {el.outline && <div className="field row"><label><span className="hint">Outline color</span><input type="color" value={el.outline.color} onChange={(e) => onChange({ outline: { ...el.outline!, color: e.target.value } })} /></label><label><span className="hint">Width</span><input type="number" value={el.outline.width} onChange={(e) => onChange({ outline: { ...el.outline!, width: Number(e.target.value) } })} /></label></div>}
      <label className="check"><input type="checkbox" checked={!!el.shadow} onChange={(e) => onChange({ shadow: e.target.checked ? { color: "#00000066", blur: 8, dx: 3, dy: 3 } : undefined })} /> Shadow</label>

      <span className="eyebrow" style={{ marginTop: 8 }}>What the customer can change</span>
      {!el.editable && !el.colorSlot && <p className="hint">Fixed — the customer can't change this text.</p>}
      <label className="check"><input type="checkbox" checked={el.editable} onChange={(e) => onChange({ editable: e.target.checked, textLabel: el.textLabel ?? "Your text" })} /> Let the customer type their own text</label>
      {el.editable && <div className="field row"><label><span className="hint">Label</span><input value={el.textLabel ?? ""} onChange={(e) => onChange({ textLabel: e.target.value })} /></label><label><span className="hint">Max chars</span><input type="number" value={el.maxChars} onChange={(e) => onChange({ maxChars: Number(e.target.value) })} /></label></div>}
      <label className="check"><input type="checkbox" checked={!!el.colorSlot} onChange={(e) => onChange({ colorSlot: e.target.checked ? { label: "Text color", options: COLORS.slice(0, 4), default: el.color } : undefined })} /> Let the customer pick the text color</label>
      {el.colorSlot && <ColorSlotCfg options={el.colorSlot.options} def={el.colorSlot.default} onChange={(options, def) => onChange({ colorSlot: { ...el.colorSlot!, options, default: def } })} />}
    </div>
  );
}

/** One-click text-effect presets, sized to the element, then tweakable (spec §9.4). */
function TextEffectPresets({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  const h = el.rect.h;
  const r = (frac: number, min: number) => Math.max(min, Math.round(h * frac));
  const presets: { id: string; label: string; apply: Partial<TextElement> }[] = [
    { id: "none", label: "None", apply: { outline: undefined, shadow: undefined } },
    { id: "outline", label: "Outline", apply: { outline: { color: "#0A0A0A", width: r(0.03, 3) }, shadow: undefined } },
    { id: "sticker", label: "Sticker", apply: { outline: { color: "#FFFFFF", width: r(0.07, 6) }, shadow: { color: "#00000040", blur: r(0.03, 4), dx: 0, dy: r(0.02, 2) } } },
    { id: "shadow", label: "Shadow", apply: { outline: undefined, shadow: { color: "#00000066", blur: r(0.04, 4), dx: r(0.02, 2), dy: r(0.02, 2) } } },
    { id: "glow", label: "Glow", apply: { outline: undefined, shadow: { color: "#FF5A1FAA", blur: r(0.09, 8), dx: 0, dy: 0 } } },
  ];
  const active = !el.outline && !el.shadow ? "none"
    : el.outline && el.outline.color.toUpperCase() === "#FFFFFF" ? "sticker"
      : el.outline ? "outline"
        : el.shadow && el.shadow.dx === 0 && el.shadow.dy === 0 ? "glow" : "shadow";
  return (
    <div className="field">
      <span className="hint">Effect</span>
      <div className="preset-row">
        {presets.map((p) => (
          <button key={p.id} className="preset" data-on={active === p.id || undefined} onClick={() => onChange(p.apply)}>{p.label}</button>
        ))}
      </div>
    </div>
  );
}

function GraphicProps({ el, parts, graphics, onChange }: { el: GraphicElement; parts: string[]; graphics: Graphic[]; onChange: (p: Partial<GraphicElement>) => void }) {
  const options = el.choiceSlot?.options ?? [];
  const toggleOption = (id: string) => {
    const next = options.includes(id) ? options.filter((o) => o !== id) : [...options, id];
    onChange({ choiceSlot: { label: el.choiceSlot?.label ?? "Choose image", options: next } });
  };
  const fixed = !el.choiceSlot && !el.colorSlot;
  return (
    <div className="pgroup">
      <span className="eyebrow" style={{ marginTop: 4 }}>What the customer can change</span>
      {fixed && <p className="hint">Fixed — the customer can't change this graphic.</p>}

      <label className="check">
        <input type="checkbox" checked={!!el.choiceSlot}
          onChange={(e) => onChange({ choiceSlot: e.target.checked ? { label: "Choose image", options: [el.assetId] } : undefined })} />
        Let the customer pick the image
      </label>
      {el.choiceSlot && (
        <div className="choice-config">
          <label className="field"><span className="hint">Label shown to customer</span>
            <input value={el.choiceSlot.label} onChange={(e) => onChange({ choiceSlot: { ...el.choiceSlot!, label: e.target.value } })} /></label>
          <span className="hint">Tick the images to offer · click a tick's tile to set the default</span>
          <div className="choice-grid">
            {graphics.map((g) => {
              const on = options.includes(g.id);
              return (
                <div key={g.id} className={`choice-tile${on ? " on" : ""}${el.assetId === g.id ? " def" : ""}`}>
                  <button className="ct-img" title={on ? "Set as default" : "Offer this"} onClick={() => (on ? onChange({ assetId: g.id }) : toggleOption(g.id))}>
                    <img src={g.thumb} alt={g.name} />
                  </button>
                  <button className="ct-tick" onClick={() => toggleOption(g.id)}>{on ? "✓" : "+"}</button>
                </div>
              );
            })}
          </div>
          <p className="hint">Offering {options.length} · default {graphics.find((g) => g.id === el.assetId)?.name ?? "—"}</p>
        </div>
      )}

      {parts.length > 0 && (
        <>
          <label className="check"><input type="checkbox" checked={!!el.colorSlot} onChange={(e) => onChange({ colorSlot: e.target.checked ? { label: "Color", part: parts[0], options: COLORS.slice(0, 4), default: "#0A0A0A" } : undefined })} /> Let the customer pick the color ({parts[0]})</label>
          {el.colorSlot && <ColorSlotCfg options={el.colorSlot.options} def={el.colorSlot.default} onChange={(options, def) => onChange({ colorSlot: { ...el.colorSlot!, options, default: def } })} />}
        </>
      )}
    </div>
  );
}

/** Image adjustments: presets + sliders (spec §10.1). */
function ImageFilters({ value, onChange }: { value?: ImageFilter; onChange: (f: ImageFilter | undefined) => void }) {
  const f: ImageFilter = value ?? {};
  const presets: { id: string; label: string; apply?: ImageFilter }[] = [
    { id: "original", label: "Original", apply: undefined },
    { id: "bw", label: "B&W", apply: { grayscale: 1 } },
    { id: "vintage", label: "Vintage", apply: { sepia: 0.5, contrast: 1.1, saturate: 0.85 } },
    { id: "vivid", label: "Vivid", apply: { saturate: 1.5, contrast: 1.1 } },
    { id: "cool", label: "Cool", apply: { brightness: 1.05, saturate: 1.1, contrast: 1.05 } },
  ];
  const set = (k: keyof ImageFilter, v: number, dflt: number) => {
    const next: ImageFilter = { ...f, [k]: v };
    if (v === dflt) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const slider = (k: keyof ImageFilter, label: string, min: number, max: number, dflt: number) => (
    <label className="field"><span className="hint">{label} · {(f[k] ?? dflt).toFixed(2)}</span>
      <input type="range" min={min} max={max} step={0.01} value={f[k] ?? dflt} onChange={(e) => set(k, Number(e.target.value), dflt)} /></label>
  );
  return (
    <div className="pgroup">
      <span className="eyebrow" style={{ marginTop: 4 }}>Adjust</span>
      <div className="preset-row">{presets.map((p) => <button key={p.id} className="preset" onClick={() => onChange(p.apply)}>{p.label}</button>)}</div>
      {slider("brightness", "Brightness", 0.5, 1.5, 1)}
      {slider("contrast", "Contrast", 0.5, 1.5, 1)}
      {slider("saturate", "Saturation", 0, 2, 1)}
      {slider("grayscale", "Grayscale", 0, 1, 0)}
    </div>
  );
}

function ImageProps({ el, onChange, addOption, onPattern }: {
  el: ImageElement; onChange: (p: Partial<ImageElement>) => void;
  addOption: (file: File) => Promise<string | null>; onPattern: () => void;
}) {
  const opts = el.choiceSlot?.options ?? [el.storageKey];
  const thumb = (id: string) => api.uploadUrl(id);
  const onFiles = async (files: FileList) => {
    const ids: string[] = [];
    for (const f of Array.from(files)) { const id = await addOption(f); if (id) ids.push(id); }
    if (ids.length) onChange({ choiceSlot: { label: el.choiceSlot?.label ?? "Choose image", options: [...new Set([...opts, ...ids])] } });
  };
  const fixed = !el.choiceSlot;
  return (
    <div className="pgroup">
      <ImageFilters value={el.filter} onChange={(filter) => onChange({ filter })} />
      <span className="eyebrow" style={{ marginTop: 4 }}>What the customer can change</span>
      {fixed && <p className="hint">Fixed — the customer can't change this image.</p>}
      <label className="check">
        <input type="checkbox" checked={!!el.choiceSlot}
          onChange={(e) => onChange({ choiceSlot: e.target.checked ? { label: "Choose image", options: [el.storageKey] } : undefined })} />
        Let the customer pick the image
      </label>
      {el.choiceSlot && (
        <div className="choice-config">
          <label className="field"><span className="hint">Label shown to customer</span>
            <input value={el.choiceSlot.label} onChange={(e) => onChange({ choiceSlot: { ...el.choiceSlot!, label: e.target.value } })} /></label>
          <div className="choice-grid">
            {opts.map((id) => (
              <div key={id} className={`choice-tile on${el.storageKey === id ? " def" : ""}`}>
                <button className="ct-img" title="Set as default" onClick={() => onChange({ storageKey: id })}><img src={thumb(id)} alt="" style={{ filter: "none" }} /></button>
                {opts.length > 1 && <button className="ct-tick" title="Remove" onClick={() => { const next = opts.filter((o) => o !== id); onChange({ choiceSlot: { ...el.choiceSlot!, options: next }, storageKey: el.storageKey === id ? next[0] : el.storageKey }); }}><Icon name="x" size={11} /></button>}
              </div>
            ))}
          </div>
          <label className="btn wide file sm">+ Add image options<input type="file" accept="image/png,image/jpeg,image/svg+xml" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} /></label>
          <p className="hint">Offering {opts.length} · default ringed</p>
        </div>
      )}
      <button className="btn wide" style={{ marginTop: 8 }} onClick={onPattern}>Make seamless pattern</button>
    </div>
  );
}

function PatternProps({ el, onChange }: { el: PatternElement; onChange: (p: Partial<PatternElement>) => void }) {
  return (
    <div className="pgroup">
      <label className="field"><span className="hint">Type</span><select value={el.type} onChange={(e) => onChange({ type: e.target.value as PatternElement["type"] })}>{PATTERNS.map((t) => <option key={t}>{t}</option>)}</select></label>
      <div className="field row"><label><span className="hint">Scale</span><input type="number" step="0.1" value={el.scale} onChange={(e) => onChange({ scale: Number(e.target.value) })} /></label><label><span className="hint">Spacing</span><input type="number" value={el.spacing} onChange={(e) => onChange({ spacing: Number(e.target.value) })} /></label></div>
    </div>
  );
}

function BackgroundProps({ el, onChange }: { el: BackgroundElement; graphics: Graphic[]; onChange: (p: Partial<BackgroundElement>) => void }) {
  return (
    <div className="pgroup">
      <ColorField label="Fill color" value={el.fill.color} palette={COLORS} onChange={(color) => onChange({ fill: { ...el.fill, color, gradient: undefined } })} />
      <GradientField value={el.fill.gradient} onChange={(gradient) => onChange({ fill: { ...el.fill, gradient } })} />
    </div>
  );
}

/** Curate which colors a color-choice slot offers, and the default. */
function ColorSlotCfg({ options, def, onChange }: { options: string[]; def: string; onChange: (options: string[], def: string) => void }) {
  const toggle = (c: string) => {
    const next = options.includes(c) ? options.filter((x) => x !== c) : [...options, c];
    onChange(next, next.includes(def) ? def : next[0] ?? c);
  };
  return (
    <div className="field">
      <span className="hint">Colors to offer · click a ticked one to set default</span>
      <div className="swatches">
        {COLORS.map((c) => {
          const on = options.includes(c);
          return <button key={c} className="sw" data-on={on} data-def={def === c} style={{ background: c, opacity: on ? 1 : 0.35 }} title={on ? "Set as default / remove" : "Offer this color"} onClick={() => (on ? onChange(options, c) : toggle(c))} onDoubleClick={() => toggle(c)} />;
        })}
      </div>
      <p className="hint">{options.length} offered · default shown ringed. Click an unticked color to add; click a ticked one to set default; double-click to remove.</p>
    </div>
  );
}
