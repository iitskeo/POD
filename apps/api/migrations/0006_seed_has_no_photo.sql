-- The seeded product claimed a photo_key that was never uploaded to R2, so the admin
-- offered it for design and then failed to load its photo. It was a placeholder until
-- the import existed; the import exists now.
--
-- Its photo is cleared rather than the row deleted: designs reference it by foreign
-- key. With no photo it cannot be previewed, so the composer filters it out on its
-- own, and picking a real imported product repoints the design on the next save.
UPDATE products SET photo_key = NULL WHERE id = 'wine-tumbler-11oz';
