import { useState } from "react";
import { Icon, type Gradient } from "@abbiss/preview-engine";
import { getList, pushRecent } from "./prefs";

const RECENT = "recent.colors";
const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
const toHex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000");

/** Brand palette + full picker + eyedropper + recent colors (spec 07 §9.3 / §10.2). */
export function ColorField({ label, value, palette, onChange }: {
  label?: string; value?: string; palette: string[]; onChange: (hex: string) => void;
}) {
  const [recent, setRecent] = useState<string[]>(() => getList(RECENT));
  const set = (hex: string) => { const h = hex.toUpperCase(); onChange(h); setRecent(pushRecent(RECENT, h)); };
  const eyedrop = async () => {
    const Eye = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!Eye) return;
    try { const r = await new Eye().open(); set(r.sRGBHex); } catch { /* cancelled */ }
  };
  return (
    <div className="field">
      {label && <span className="hint">{label}</span>}
      <div className="color-row">
        <div className="swatches">
          {palette.map((c) => <button key={c} className="sw" data-on={value?.toUpperCase() === c.toUpperCase()} style={{ background: c }} onClick={() => set(c)} />)}
          <label className="sw picker" title="Custom color" style={{ background: toHex(value) }}>
            <Icon name="plus" size={13} />
            <input type="color" value={toHex(value)} onChange={(e) => set(e.target.value)} />
          </label>
        </div>
        {hasEyeDropper && <button className="mini" title="Eyedropper — sample any color" onClick={eyedrop}><Icon name="droplet" size={15} /></button>}
      </div>
      {recent.length > 0 && (
        <div className="swatches recents">{recent.map((c) => <button key={c} className="sw sm" style={{ background: c }} title={c} onClick={() => set(c)} />)}</div>
      )}
    </div>
  );
}

/** Linear-gradient fill: two stops + angle (spec §9.3/§10.2). */
export function GradientField({ value, onChange }: { value?: Gradient; onChange: (g: Gradient | undefined) => void }) {
  const g = value ?? { from: "#FF5A1F", to: "#1D4ED8", angle: 90 };
  return (
    <div className="field">
      <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? g : undefined)} /> Gradient fill</label>
      {value && (
        <div className="grad-row">
          <input type="color" value={toHex(value.from)} onChange={(e) => onChange({ ...value, from: e.target.value })} title="From" />
          <input type="color" value={toHex(value.to)} onChange={(e) => onChange({ ...value, to: e.target.value })} title="To" />
          <label className="grad-angle"><span className="hint">Angle · {value.angle}°</span>
            <input type="range" min={0} max={360} value={value.angle} onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })} />
          </label>
        </div>
      )}
    </div>
  );
}
