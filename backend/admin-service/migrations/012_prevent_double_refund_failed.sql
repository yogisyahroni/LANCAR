-- UAT-AN-070: cegah double refund record — perluas partial unique index
-- refunds supaya status 'failed' juga memblokir record duplikat per order.
-- (Retry refund gagal dilakukan lewat record yang sama, bukan create baru.)
DROP INDEX IF EXISTS idx_refunds_single_active_per_order;
CREATE UNIQUE INDEX idx_refunds_single_active_per_order
    ON refunds (order_id)
    WHERE status IN ('pending', 'processed', 'failed');
