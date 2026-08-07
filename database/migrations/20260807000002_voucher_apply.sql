-- ============================================================
-- FB-078: Voucher redeem customer di checkout
-- orders TIDAK butuh kolom baru — reuse discount_idr + promo_code
-- (sudah ada). voucher_usages mencatat voucher_id+order_id+user_id.
-- Index pendukung laporan finance voucher.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_voucher_usages_used_at
    ON voucher_usages (used_at DESC);
