-- The flat editor draws the design on Printful's own product template: the base
-- photo plus the print-area rectangle on it. That is how Printful's editor previews
-- live, and it works for a tumbler, a cap or a bag alike because Printful supplies
-- the template per product. Stored at import so the admin needs no extra call.
--
-- Shape: { variantId, placements: [{ placement, imageUrl, backgroundColor,
--          templateWidth, templateHeight, printArea:{top,left,width,height} }] }
ALTER TABLE products ADD COLUMN template TEXT;
