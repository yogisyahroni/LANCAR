-- +goose Up
-- ============================================================
-- FB-107: mode "Pause Sementara" merchant — merchant bisa pause
-- 15-30 menit tanpa mengubah status buka utama / jam operasional.
-- paused_until TIMESTAMPTZ NULL = tidak sedang pause.
-- ============================================================

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN merchants.paused_until IS 'Pause sementara sampai jam ini (FB-107). NULL = tidak pause. Auto un-pause saat waktu habis (cek via NOW()). Tidak mengubah is_open / jam operasional.';

-- +goose Down
ALTER TABLE merchants
  DROP COLUMN IF EXISTS paused_until;
