-- +goose Up
-- FB-123-AUDIT-FIX (2026-08-09 audit pass):
--   C1: refund tidak boleh dobel untuk order yang sama. Partial unique index:
--   hanya blokir refund yang masih aktif (pending/processed — status yang
--   dipakai codebase; refund failed boleh dibuat ulang).
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_single_active_per_order
    ON refunds (order_id)
    WHERE status IN ('pending', 'processed');

-- m1: worker scheduled order butuh index komposit status+scheduled_at
-- (GetScheduledFoodOrdersDue WHERE status='scheduled' AND scheduled_at <= ...).
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_due
    ON orders (status, scheduled_at)
    WHERE status = 'scheduled';

-- +goose Down
DROP INDEX IF EXISTS idx_refunds_single_active_per_order;
DROP INDEX IF EXISTS idx_orders_scheduled_due;
