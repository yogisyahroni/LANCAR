-- +goose Up
-- ============================================================
-- LANCAR — Fix sinkronisasi courier_profiles.tier CHECK constraint.
-- Migration 20260701000001 (applied 2026-07-31) menstandardisasi
-- tier config tapi tidak mengganti CHECK constraint lama di
-- courier_profiles (hanya mengizinkan regular/mitra/elite).
-- Efek: INSERT/UPDATE courier tier baru (standart/gold/god_mode)
-- gagal dengan constraint violation. Migration ini menyinkronkan
-- constraint dengan nilai tier yang sudah distandardisasi.
-- Idempotent: aman dijalankan kapan pun / di DB mana pun.
-- ============================================================

ALTER TABLE courier_profiles DROP CONSTRAINT IF EXISTS courier_profiles_tier_check;

-- Konversi nilai tier legacy ke nilai baru (aman jika sudah baru).
UPDATE courier_profiles
SET tier = CASE
  WHEN tier IN ('starter', 'regular') THEN 'standart'
  WHEN tier IN ('reliable', 'mitra') THEN 'gold'
  WHEN tier = 'elite' THEN 'god_mode'
  ELSE 'standart'
END
WHERE tier IS NOT NULL
  AND tier NOT IN ('standart', 'silver', 'gold', 'god_mode');

ALTER TABLE courier_profiles ALTER COLUMN tier SET DEFAULT 'standart';

ALTER TABLE courier_profiles
  ADD CONSTRAINT courier_profiles_tier_check
  CHECK (tier IN ('standart','silver','gold','god_mode'));

-- +goose Down
-- Tidak ada rollback aman (hanya sinkronisasi state). Down = no-op.
