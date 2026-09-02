-- +goose Up
-- Canonical exception queue for completed money flows whose source ledgers
-- disagree. Rows are immutable evidence; resolution is an append-only note.
-- Older tax migrations used `export_status` while the active tax repository
-- reads `status`; align the schema before the finance reconciliation query.
ALTER TABLE tax_efaktur_exports
    ADD COLUMN IF NOT EXISTS status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS export_status VARCHAR(20);
UPDATE tax_efaktur_exports
SET status = COALESCE(status, export_status, 'draft')
WHERE status IS NULL;
ALTER TABLE tax_efaktur_exports
    ALTER COLUMN status SET DEFAULT 'draft';

CREATE TABLE IF NOT EXISTS finance_reconciliation_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exception_key VARCHAR(180) NOT NULL,
    service_sub_type VARCHAR(30),
    provider VARCHAR(50),
    reference_type VARCHAR(50) NOT NULL,
    reference_id VARCHAR(100) NOT NULL,
    expected_idr BIGINT NOT NULL,
    actual_idr BIGINT NOT NULL,
    difference_idr BIGINT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'under_review', 'resolved', 'accepted')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT finance_reconciliation_exceptions_key_unique UNIQUE (exception_key)
);

CREATE INDEX IF NOT EXISTS idx_finance_recon_exceptions_queue
    ON finance_reconciliation_exceptions(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_recon_exceptions_dimensions
    ON finance_reconciliation_exceptions(service_sub_type, provider, last_seen_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_finance_recon_exceptions_dimensions;
DROP INDEX IF EXISTS idx_finance_recon_exceptions_queue;
DROP TABLE IF EXISTS finance_reconciliation_exceptions;
