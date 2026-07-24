import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "@abbiss/preview-engine";
import { getList, pushRecent, toggleFav } from "./prefs";

/** Curated design-font library (spec 07 §9.1) — grouped by style, previewed in its own face. */
const FONT_LIB: { name: string; cat: string }[] = [
  { name: "Space Grotesk", cat: "Sans" }, { name: "Inter", cat: "Sans" }, { name: "Poppins", cat: "Sans" },
  { name: "Montserrat", cat: "Sans" }, { name: "Archivo", cat: "Sans" },
  { name: "Playfair Display", cat: "Serif" }, { name: "Lora", cat: "Serif" }, { name: "Merriweather", cat: "Serif" },
  { name: "Bebas Neue", cat: "Display" }, { name: "Anton", cat: "Display" }, { name: "Righteous", cat: "Display" },
  { name: "Pacifico", cat: "Script" }, { name: "Dancing Script", cat: "Script" }, { name: "Caveat", cat: "Script" },
  { name: "IBM Plex Mono", cat: "Mono" }, { name: "JetBrains Mono", cat: "Mono" },
];
const CATS = ["Sans", "Serif", "Display", "Script", "Mono"];
const FAV = "fav.fonts", RECENT = "recent.fonts";

export function FontPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [fav, setFav] = useState<string[]>(() => getList(FAV));
  const [recent, setRecent] = useState<string[]>(() => getList(RECENT));
  const pick = (name: string) => { onChange(name); setRecent(pushRecent(RECENT, name)); setOpen(false); setQ(""); };
  const star = (name: string, e: ReactMouseEvent) => { e.stopPropagation(); setFav(toggleFav(FAV, name)); };

  const term = q.trim().toLowerCase();
  const row = (name: string) => (
    <button key={name} className="font-row" data-on={name === value} onClick={() => pick(name)}>
      <span className="font-name" style={{ fontFamily: `'${name}'` }}>{name}</span>
      <span className="star" data-on={fav.includes(name) || undefined} title="Favorite" onClick={(e) => star(name, e)}><Icon name="star" size={13} /></span>
    </button>
  );

  return (
    <div className="fontpicker">
      <button className="font-current" onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: `'${value}'` }}>{value}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={15} />
      </button>
      {open && (
        <div className="font-panel">
          <input className="lib-search" placeholder="Search fonts…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {!term && fav.length > 0 && <div className="font-group"><span className="eyebrow">Favorites</span>{fav.filter((f) => FONT_LIB.some((x) => x.name === f)).map(row)}</div>}
          {!term && recent.length > 0 && <div className="font-group"><span className="eyebrow">Recent</span>{recent.filter((f) => FONT_LIB.some((x) => x.name === f)).map(row)}</div>}
          {CATS.map((cat) => {
            const items = FONT_LIB.filter((f) => f.cat === cat && (!term || f.name.toLowerCase().includes(term)));
            if (!items.length) return null;
            return <div key={cat} className="font-group"><span className="eyebrow">{cat}</span>{items.map((f) => row(f.name))}</div>;
          })}
        </div>
      )}
    </div>
  );
}
