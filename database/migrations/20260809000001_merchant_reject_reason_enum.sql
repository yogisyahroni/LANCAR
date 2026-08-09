-- +goose Up
-- ============================================================
-- FB-122: alasan reject merchant terstruktur (enum).
-- cancellation_reason tetap diisi label bahasa Indonesia (ramah customer);
-- reject_reason menyimpan kode enum untuk analitik.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reject_reason TEXT NULL;

-- +goose Down
ALTER TABLE orders
  DROP COLUMN IF EXISTS reject_reason;
