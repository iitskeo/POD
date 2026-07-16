-- Status values are data, not UI copy: existing rows have to move with the code or
-- the storefront stops finding published designs.
UPDATE designs SET status = 'draft'     WHERE status = 'borrador';
UPDATE designs SET status = 'published' WHERE status = 'publicado';

UPDATE products SET status = 'draft'     WHERE status = 'borrador';
UPDATE products SET status = 'published' WHERE status = 'publicado';

UPDATE orders SET status = 'pending_payment' WHERE status = 'pendiente_pago';
UPDATE orders SET status = 'paid'            WHERE status = 'pagado';
UPDATE orders SET status = 'sent_to_provider' WHERE status = 'enviado_a_proveedor';
UPDATE orders SET status = 'fulfilled'       WHERE status = 'cumplido';
