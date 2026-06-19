-- +goose Up
-- Tambah kolom untuk sistem lock foto profil kurir
-- Setelah admin mengunci foto (saat kurir ke basecamp), kurir tidak bisa update sendiri
-- dan tidak bisa menerima order sebelum foto dikunci

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_photo_set_by UUID REFERENCES users(id);

COMMENT ON COLUMN users.profile_photo_locked_at IS 'Timestamp saat admin mengunci foto profil kurir. NULL = belum difoto di basecamp, kurir belum bisa aktif.';
COMMENT ON COLUMN users.profile_photo_set_by IS 'ID admin yang mengambil/mengunci foto profil kurir.';

CREATE INDEX IF NOT EXISTS idx_users_photo_lock ON users(profile_photo_locked_at) WHERE role = 'courier';

-- +goose Down
ALTER TABLE users
  DROP COLUMN IF EXISTS profile_photo_locked_at,
  DROP COLUMN IF EXISTS profile_photo_set_by;
