-- +goose Up
-- ============================================================
-- LANCAR — Staff Management (M1, CORPORATE ONLY).
-- merchant_staff: staff untuk toko bertipe 'perusahaan'.
-- Individual (perorangan) TIDAK punya staff sama sekali.
-- ============================================================

-- 1) Tambah role 'merchant_staff' ke users (login staff terpisah dari owner).
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'merchant',
    'merchant_staff',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));

-- 2) Tabel merchant_staff.
CREATE TABLE IF NOT EXISTS merchant_staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  -- role di dalam toko: manager | kasir | kitchen
  role            VARCHAR(20) NOT NULL DEFAULT 'kasir'
                    CHECK (role IN ('manager', 'kasir', 'kitchen')),
  -- invite_token: di-generate owner, dikirim ke staff (email/WA).
  -- Staff pakai token ini di app untuk "terima undangan" → set user_id.
  invite_token    VARCHAR(64) NOT NULL UNIQUE,
  invited_by      UUID NOT NULL REFERENCES users(id),
  -- status: pending (belum accept) | active | revoked
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'revoked')),
  -- bitmask permission (lihat domain.StaffPermission).
  permissions     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_staff_merchant ON merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_user ON merchant_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_token ON merchant_staff(invite_token);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_status ON merchant_staff(status);

-- +goose Down
DROP TABLE IF EXISTS merchant_staff;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'courier',
    'merchant',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
    'super_admin'
  ));
