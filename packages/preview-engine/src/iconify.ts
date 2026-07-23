// Provided searchable library (spec 07 §4). Backed by the Iconify API
// (api.iconify.design): a real search endpoint over 200+ open icon sets that returns
// clean SVGs on demand — near-zero storage on our side.
//
// POD license safety: we whitelist only permissive / CC0-friendly sets (MIT / ISC /
// Apache-2.0). CC-BY / share-alike and brand/logo sets are excluded — see spec §4.
// The owner picks an icon; we import its SVG into the owner's asset library, so all the
// existing resolver / recolor / choice-slot machinery just works.

export interface IconSet { prefix: string; label: string; colored: boolean }

/** The whitelist. `colored` sets (emoji) keep their colors; the rest are recolorable. */
export const ICONIFY_SETS: IconSet[] = [
  { prefix: "lucide", label: "Lucide", colored: false },
  { prefix: "tabler", label: "Tabler", colored: false },
  { prefix: "ph", label: "Phosphor", colored: false },
  { prefix: "heroicons", label: "Heroicons", colored: false },
  { prefix: "iconoir", label: "Iconoir", colored: false },
  { prefix: "material-symbols", label: "Material", colored: false },
  { prefix: "fluent-emoji-flat", label: "Emoji", colored: true },
  { prefix: "noto", label: "Noto emoji", colored: true },
];

const WHITELIST = new Set(ICONIFY_SETS.map((s) => s.prefix));
const PREFIXES = ICONIFY_SETS.map((s) => s.prefix).join(",");
const COLORED = new Set(ICONIFY_SETS.filter((s) => s.colored).map((s) => s.prefix));
const BASE = "https://api.iconify.design";

export interface IconRef { id: string; prefix: string; name: string; colored: boolean }

function toRef(id: string): IconRef {
  const [prefix, name] = id.split(":");
  return { id, prefix, name, colored: COLORED.has(prefix) };
}

/** Search the whitelisted sets. Returns icon refs (id = "prefix:name"). */
export async function searchIconify(query: string, limit = 64): Promise<IconRef[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${BASE}/search?query=${encodeURIComponent(q)}&prefixes=${PREFIXES}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Icon search failed (${res.status})`);
  const data = (await res.json()) as { icons?: string[] };
  // Defensive: only ever surface whitelisted (POD-safe) sets, even if the API ignores prefixes.
  return (data.icons ?? []).map(toRef).filter((r) => WHITELIST.has(r.prefix));
}

/** A small preview URL for an icon tile. Colored sets render in color; others in black. */
export function iconThumbUrl(ref: IconRef): string {
  return ref.colored
    ? `${BASE}/${ref.prefix}/${ref.name}.svg?height=48`
    : `${BASE}/${ref.prefix}/${ref.name}.svg?height=48&color=%23111111`;
}

/**
 * Fetch an icon's SVG for import into the owner's library. Monochrome icons get a
 * `data-recolor="icon"` marker so the customer/owner color-slot machinery can recolor
 * them; colored emoji are imported unchanged.
 */
export async function fetchIconSvg(ref: IconRef): Promise<string> {
  const res = await fetch(`${BASE}/${ref.prefix}/${ref.name}.svg`);
  if (!res.ok) throw new Error(`Icon fetch failed (${res.status})`);
  const svg = await res.text();
  if (ref.colored) return svg;
  return svg
    .replace(/fill="currentColor"/g, 'fill="#111111" data-recolor="icon"')
    .replace(/stroke="currentColor"/g, 'stroke="#111111" data-recolor="icon" data-recolor-paint="stroke"');
}
