-- +goose Up
ALTER TABLE logistics_exception_claims
    ADD COLUMN IF NOT EXISTS item_value_idr BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS insurance_coverage_idr BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_claim_reference VARCHAR(160),
    ADD COLUMN IF NOT EXISTS fee_borne_by VARCHAR(50),
    ADD COLUMN IF NOT EXISTS evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_logistics_exception_claim_order_type
    ON logistics_exception_claims(order_id, exception_type);

-- +goose Down
DROP INDEX IF EXISTS uq_logistics_exception_claim_order_type;
ALTER TABLE logistics_exception_claims
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS evidence_urls,
    DROP COLUMN IF EXISTS fee_borne_by,
    DROP COLUMN IF EXISTS provider_claim_reference,
    DROP COLUMN IF EXISTS insurance_coverage_idr,
    DROP COLUMN IF EXISTS item_value_idr;
