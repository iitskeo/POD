-- The seeded product still carried Printify's spec with the old wraps360 boolean,
-- so reading printSpec.wrapDegrees off it threw. Field renames in code do not reach
-- rows already written: JSON columns need migrating like any other data.
--
-- Values updated to Printful's real Wine Tumbler (10.58 x 3.17 in @300dpi, UV).
UPDATE products
SET print_spec = '{"widthPx":3175,"heightPx":950,"dpi":300,"wrapDegrees":360,"bleedPx":0}'
WHERE id = 'wine-tumbler-11oz';
