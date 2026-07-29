-- Payments (PayPal) + fulfillment (docs/pod/10-payments.md).
-- Orders move from draft-only to: draft -> pending_payment -> paid (-> submitted on fulfilment).
ALTER TABLE orders ADD COLUMN payment_provider TEXT;      -- 'paypal'
ALTER TABLE orders ADD COLUMN paypal_order_id TEXT;
ALTER TABLE orders ADD COLUMN paypal_capture_id TEXT;
ALTER TABLE orders ADD COLUMN paid_at INTEGER;
ALTER TABLE orders ADD COLUMN printful_order_id TEXT;     -- set once submitted to Printful
ALTER TABLE orders ADD COLUMN fulfillment_status TEXT;    -- null | 'submitted' | 'failed'
ALTER TABLE orders ADD COLUMN fulfillment_error TEXT;

-- Per-item print files rendered at checkout (JSON {placement: url}), needed to submit to
-- Printful server-side (the Worker can't render canvas).
ALTER TABLE order_items ADD COLUMN print_files TEXT;
