-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-054: kolom appeal resolution di driver_penalty_log
-- Dipakai admin-service untuk approve/reject banding driver:
-- resolution_note = catatan admin, updated_at = waktu keputusan.
-- ============================================================

ALTER TABLE driver_penalty_log
  ADD COLUMN IF NOT EXISTS resolution_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- +goose Down
ALTER TABLE driver_penalty_log
  DROP COLUMN IF EXISTS resolution_note,
  DROP COLUMN IF EXISTS updated_at;
