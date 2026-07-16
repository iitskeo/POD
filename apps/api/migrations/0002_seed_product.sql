-- Wine Tumbler 11oz. Medidas leidas del template oficial de Printify
-- (DigitalOnDemand_WineTumbler_Template.psd): 3278x900 @300dpi, envoltura 360,
-- sangrado de 57px. Semilla hasta que exista el import desde Printify.
INSERT OR IGNORE INTO products
  (id, name, slug, status, source, external_product_id, external_variant_id,
   photo_key, surface, print_band, calibration, print_spec, created_at, updated_at)
VALUES (
  'wine-tumbler-11oz',
  'Wine Tumbler 11oz',
  'wine-tumbler-11oz',
  'publicado',
  'printify',
  NULL,
  NULL,
  'products/wine-tumbler-11oz/photo.png',
  'revolution',
  NULL,
  '{"shadingStrength":1,"safeAngleDeg":45}',
  '{"widthPx":3278,"heightPx":900,"dpi":300,"wraps360":true,"bleedPx":57}',
  unixepoch() * 1000,
  unixepoch() * 1000
);
