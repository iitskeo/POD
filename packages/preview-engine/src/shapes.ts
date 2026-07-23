// CC0 basic-shapes pack (spec 07 §4). Guarantees clean primitives regardless of the
// Iconify search. Public-domain, hand-made; each carries a `data-recolor="shape"` part
// so it plugs into the recolor / color-slot machinery.

export interface ShapeAsset { id: string; name: string; svg: string; aspect: number }

const S = (name: string, inner: string): [string, string] => [
  name,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`,
];

const RAW: Array<[string, string]> = [
  S("Rectangle", '<rect x="8" y="20" width="84" height="60" data-recolor="shape" fill="#111111"/>'),
  S("Circle", '<circle cx="50" cy="50" r="42" data-recolor="shape" fill="#111111"/>'),
  S("Triangle", '<polygon points="50,8 92,92 8,92" data-recolor="shape" fill="#111111"/>'),
  S("Star", '<polygon points="50,5 61,38 96,38 68,59 79,92 50,72 21,92 32,59 4,38 39,38" data-recolor="shape" fill="#111111"/>'),
  S("Heart", '<path d="M50 88C22 68 8 52 8 34a22 22 0 0 1 42-9 22 22 0 0 1 42 9c0 18-14 34-42 54Z" data-recolor="shape" fill="#111111"/>'),
  S("Arrow", '<polygon points="4,40 60,40 60,20 96,50 60,80 60,60 4,60" data-recolor="shape" fill="#111111"/>'),
];

export const SHAPE_ASSETS: ShapeAsset[] = RAW.map(([name, svg]) => ({
  id: `shape:${name.toLowerCase()}`, name, svg, aspect: 1,
}));

export const SHAPE_SVG = new Map(SHAPE_ASSETS.map((a) => [a.id, a.svg]));
