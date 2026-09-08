-- +goose Up
-- MERCH-2026-002: canonical merchant branches, staff scope and device sessions.

-- Repair-safe bootstrap: some existing databases have the 20260814 goose
-- version recorded while its table was absent. Keep this migration usable on
-- both a clean install and that recoverable drifted state.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
    'customer', 'courier', 'merchant', 'merchant_staff', 'ops_security',
    'ops_admin', 'finance_admin', 'cs_agent', 'zone_manager', 'super_admin'
));

CREATE TABLE IF NOT EXISTS merchant_staff (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id  UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id      UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    role         VARCHAR(20) NOT NULL DEFAULT 'kasir',
    invite_token VARCHAR(64) NOT NULL UNIQUE,
    invited_by   UUID NOT NULL REFERENCES users(id),
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'revoked')),
    permissions  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_staff_merchant ON merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_user ON merchant_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_token ON merchant_staff(invite_token);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_status ON merchant_staff(status);

CREATE TABLE IF NOT EXISTS merchant_branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code        VARCHAR(32) NOT NULL,
    name        VARCHAR(120) NOT NULL,
    address     TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_merchant_branch_code UNIQUE (merchant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_merchant_branches_merchant_active
    ON merchant_branches (merchant_id, is_active, created_at);

-- Every merchant has a safe default branch so existing corporate staff can be
-- migrated without acquiring implicit access to future branches.
INSERT INTO merchant_branches (merchant_id, code, name, address)
SELECT m.id, 'MAIN',
       COALESCE(NULLIF(m.nama_toko, ''), 'Main Branch'),
       COALESCE(NULLIF(m.alamat, ''), 'Alamat belum diisi')
FROM merchants m
ON CONFLICT (merchant_id, code) DO NOTHING;

ALTER TABLE merchant_staff
    DROP CONSTRAINT IF EXISTS merchant_staff_role_check;

UPDATE merchant_staff SET role = 'cashier' WHERE role = 'kasir';

ALTER TABLE merchant_staff
    ADD CONSTRAINT merchant_staff_role_check
    CHECK (role IN ('manager', 'kitchen', 'cashier', 'marketing', 'finance'));

CREATE TABLE IF NOT EXISTS merchant_staff_branch_access (
    staff_id   UUID NOT NULL REFERENCES merchant_staff(id) ON DELETE CASCADE,
    branch_id  UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (staff_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_branch_access_branch
    ON merchant_staff_branch_access (branch_id, staff_id);

-- Existing staff retain access to the pre-existing MAIN branch only.
INSERT INTO merchant_staff_branch_access (staff_id, branch_id)
SELECT s.id, b.id
FROM merchant_staff s
JOIN merchant_branches b ON b.merchant_id = s.merchant_id AND b.code = 'MAIN'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS merchant_device_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id          UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    branch_id            UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    staff_id             UUID NULL REFERENCES merchant_staff(id) ON DELETE SET NULL,
    device_id            VARCHAR(255) NOT NULL,
    device_label         VARCHAR(120),
    session_token_hash   CHAR(64) NOT NULL UNIQUE,
    granted_permissions  INTEGER NOT NULL DEFAULT 0 CHECK (granted_permissions >= 0),
    expires_at           TIMESTAMPTZ NOT NULL,
    last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_device_sessions_auth
    ON merchant_device_sessions (session_token_hash, merchant_id, branch_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_device_sessions_user
    ON merchant_device_sessions (user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS merchant_security_approvals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    requested_by        UUID NOT NULL REFERENCES users(id),
    change_type         VARCHAR(32) NOT NULL CHECK (change_type IN ('bank_account', 'payout', 'merchant_config')),
    idempotency_key     VARCHAR(160) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    approval_reference  VARCHAR(160),
    approved_by         UUID REFERENCES users(id),
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at         TIMESTAMPTZ,
    CONSTRAINT uq_merchant_security_approval_key UNIQUE (merchant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_merchant_security_approvals_pending
    ON merchant_security_approvals (merchant_id, status, expires_at);

-- Revocation is both explicit and defensive: every authorization query also
-- checks staff status, while this trigger removes existing sessions promptly.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION revoke_merchant_staff_sessions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE merchant_device_sessions
        SET revoked_at = NOW()
        WHERE staff_id = NEW.id AND revoked_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_revoke_merchant_staff_sessions ON merchant_staff;
CREATE TRIGGER trg_revoke_merchant_staff_sessions
AFTER UPDATE OF status ON merchant_staff
FOR EACH ROW EXECUTE FUNCTION revoke_merchant_staff_sessions();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION revoke_merchant_branch_sessions()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = FALSE AND OLD.is_active IS DISTINCT FROM NEW.is_active THEN
        UPDATE merchant_device_sessions
        SET revoked_at = NOW()
        WHERE branch_id = NEW.id AND revoked_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_revoke_merchant_branch_sessions ON merchant_branches;
CREATE TRIGGER trg_revoke_merchant_branch_sessions
AFTER UPDATE OF is_active ON merchant_branches
FOR EACH ROW EXECUTE FUNCTION revoke_merchant_branch_sessions();

-- +goose Down
DROP TRIGGER IF EXISTS trg_revoke_merchant_branch_sessions ON merchant_branches;
DROP FUNCTION IF EXISTS revoke_merchant_branch_sessions();
DROP TRIGGER IF EXISTS trg_revoke_merchant_staff_sessions ON merchant_staff;
DROP FUNCTION IF EXISTS revoke_merchant_staff_sessions();
DROP TABLE IF EXISTS merchant_security_approvals;
DROP TABLE IF EXISTS merchant_device_sessions;
DROP TABLE IF EXISTS merchant_staff_branch_access;
DROP TABLE IF EXISTS merchant_branches;

ALTER TABLE merchant_staff
    DROP CONSTRAINT IF EXISTS merchant_staff_role_check;
UPDATE merchant_staff SET role = 'kasir' WHERE role IN ('cashier', 'marketing', 'finance');
ALTER TABLE merchant_staff
    ADD CONSTRAINT merchant_staff_role_check
    CHECK (role IN ('manager', 'kasir', 'kitchen'));
