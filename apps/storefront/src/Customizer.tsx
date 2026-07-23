import {
  PlacementStage, makeResolver, slotsOf, defaultValues, textOverflow, svgDataUrl, SEED_ASSETS,
  type Design, type Placement, type Product, type SlotValues, type TextElement,
} from "@abbiss/preview-engine";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { cart } from "./cartStore";
import { navigate } from "./App";

// A thumbnail for any graphic option: bundled starters are inline SVG, owner assets
// are served from the API.
const graphicThumb = (id: string) => {
  const seed = SEED_ASSETS.find((s) => s.id === id);
  return seed ? svgDataUrl(seed.svg) : api.assetFileUrl(id);
};

export function Customizer({ slug }: { slug: string }) {
  const resolver = useMemo(() => makeResolver(api), []);
  const [product, setProduct] = useState<Product | null>(null);
  const [design, setDesign] = useState<Design | null>(null);
  const [values, setValues] = useState<SlotValues>({});
  const [active, setActive] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await api.productBySlug(slug);
      const d = await api.designForProduct(p.id);
      setProduct(p); setDesign(d);
      setValues(defaultValues(d.elements));
      setActive(p.placements[0]?.placement ?? "");
    })().catch((e) => setError(String(e.message ?? e)));
  }, [slug]);

  const slots = useMemo(() => (design ? slotsOf(design.elements) : []), [design]);

  // A variant is only "chosen" once both size and color are picked (spec FR-S5).
  const hasSizes = useMemo(() => product?.variants.some((v) => v.size) ?? false, [product]);
  const hasColors = useMemo(() => product?.variants.some((v) => v.color) ?? false, [product]);
  const variant = useMemo(() => {
    if (!product) return null;
    if ((hasSizes && !size) || (hasColors && !color)) return null;
    return product.variants.find((v) => (!hasSizes || v.size === size) && (!hasColors || v.color === color)) ?? null;
  }, [product, size, color, hasSizes, hasColors]);
  // For the stage template, fall back to a representative variant's color even before choice.
  const previewVariant = variant ?? (color ? product?.variants.find((v) => v.color === color) : null) ?? null;

  const placements: Placement[] = useMemo(() => {
    if (!product) return [];
    const vt = previewVariant ? product.variantTemplates?.[previewVariant.id] : null;
    return vt ?? product.placements;
  }, [product, previewVariant]);
  const placement = placements.find((p) => p.placement === active) ?? placements[0];

  if (error) return <p className="hint pad warn">{error}</p>;
  if (!product || !design || !placement) return <p className="hint pad">Loading…</p>;

  const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[];
  // Honor the owner's offered-colors curation (spec §7.1); null = offer all.
  const offered = product.offeredVariantColors;
  const colors = ([...new Set(product.variants.map((v) => v.color).filter(Boolean))] as string[])
    .filter((c) => !offered || offered.includes(c));
  const swatch = (c: string) => product.variants.find((v) => v.color === c)?.colorCode ?? "#ccc";

  const overflow = design.elements.some((el) => el.kind === "text" && textOverflow(el as TextElement, values));
  const canAdd = !!variant && !overflow;
  const reason = !variant ? "Choose size and color" : overflow ? "Text is too long" : "";

  const addToCart = () => {
    if (!variant) return;
    cart.add({
      productId: product.id, productSlug: product.slug, designId: design.id, name: product.name,
      variantId: String(variant.id), variantLabel: `${variant.size ?? ""} / ${variant.color ?? ""}`.trim(),
      slotValues: values, unitPriceCents: product.retailPriceCents, qty: 1,
      previewUrl: variant.image,
    });
    navigate("/cart");
  };

  const countFor = (pl: string) => design.elements.filter((e) => e.placement === pl).length;

  return (
    <div className="cz">
      <div className="cz-stage">
        <div className="placement-tabs light">
          {placements.filter((pl) => countFor(pl.placement) > 0).map((pl) => (
            <button key={pl.placement} data-on={pl.placement === active} onClick={() => setActive(pl.placement)}>{pl.placement}</button>
          ))}
        </div>
        <PlacementStage placement={placement} elements={design.elements} values={values} resolver={resolver} mode="customize" />
        <p className="hint">Live preview — this is what prints.</p>
      </div>

      <aside className="cz-controls">
        <div className="group">
          <span className="eyebrow">Size</span>
          <div className="chips">{sizes.map((s) => <button key={s} className="chip" data-on={size === s} onClick={() => setSize(s)}>{s}</button>)}</div>
        </div>
        <div className="group">
          <span className="eyebrow">Color</span>
          <div className="swatches">{colors.map((c) => <button key={c} className="sw" title={c} data-on={color === c} style={{ background: swatch(c) }} onClick={() => setColor(c)} />)}</div>
        </div>

        {slots.map((s) => (
          <div className="group" key={s.elementId + s.kind}>
            <span className="eyebrow">{s.label}</span>
            {s.kind === "text" && (
              <>
                <input value={values[s.elementId] ?? ""} maxLength={s.maxChars}
                  onChange={(e) => setValues((v) => ({ ...v, [s.elementId]: e.target.value }))} />
                <p className="hint">{(values[s.elementId] ?? "").length}/{s.maxChars}</p>
              </>
            )}
            {s.kind === "color" && (
              <div className="swatches">{s.options.map((c) => <button key={c} className="sw" style={{ background: c }} data-on={(values[`${s.elementId}.color`] ?? s.default) === c} onClick={() => setValues((v) => ({ ...v, [`${s.elementId}.color`]: c }))} />)}</div>
            )}
            {s.kind === "graphic" && (
              <div className="tiles">{s.options.map((g) => <button key={g} className="tile" data-on={(values[`${s.elementId}.graphic`] ?? s.default) === g} onClick={() => setValues((v) => ({ ...v, [`${s.elementId}.graphic`]: g }))}><img src={graphicThumb(g)} alt="" /></button>)}</div>
            )}
            {s.kind === "image" && (
              <div className="tiles">{s.options.map((id) => <button key={id} className="tile photo" data-on={(values[`${s.elementId}.image`] ?? s.default) === id} onClick={() => setValues((v) => ({ ...v, [`${s.elementId}.image`]: id }))}><img src={api.uploadUrl(id)} alt="" /></button>)}</div>
            )}
          </div>
        ))}

        <div className="buy">
          <span className="mono price big">${(product.retailPriceCents / 100).toFixed(2)}</span>
          <button className="cta wide" disabled={!canAdd} onClick={addToCart}>Add to cart</button>
          {!canAdd && <p className="hint warn">{reason}</p>}
        </div>
      </aside>
    </div>
  );
}
