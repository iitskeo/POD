-- Real shipping charged to the customer (docs/pod/10). The order total the buyer pays and the
-- server verifies is subtotal_cents + shipping_cents (Printful's live rate).
ALTER TABLE orders ADD COLUMN shipping_cents INTEGER;
