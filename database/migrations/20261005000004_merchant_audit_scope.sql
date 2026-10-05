-- +goose Up

-- Keep merchant audit reads tenant-scoped without parsing the free-form payload.
-- Existing audit events remain readable from the shared append-only stream, while
-- new Merchant Portal events carry the server-resolved merchant id explicitly.
ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_audit_logs_merchant_created_at
    ON audit_logs(merchant_id, created_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_audit_logs_merchant_created_at;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS merchant_id;
