-- Spec 07 (admin editor) additions:
--  - offered_variant_colors: the owner curates which variant colors the storefront shows
--    (all sizes are always offered). JSON: string[] of color names. NULL = offer all.
--  - mockups: Printful mockups generated at publish and the owner's featured selection.
--    JSON: { generated: string[], featured: string[] } (featured ordered, first = main).
ALTER TABLE products ADD COLUMN offered_variant_colors TEXT;
ALTER TABLE products ADD COLUMN mockups TEXT;
