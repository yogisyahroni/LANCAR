-- +goose Up
-- Provider-neutral intake for parcel insurance claims. Provider claim IDs are
-- nullable and must only be populated after a real insurer acknowledges them.
CREATE TABLE IF NOT EXISTS order_insurance_claims (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_insurance_id  UUID NOT NULL REFERENCES order_insurance(id),
    order_id            UUID NOT NULL REFERENCES orders(id),
    claimant_id         UUID NOT NULL REFERENCES users(id),
    reason              TEXT NOT NULL,
    claimed_amount      INT NOT NULL CHECK (claimed_amount > 0),
    evidence_urls       JSONB NOT NULL DEFAULT '[]'::jsonb,
    status              VARCHAR(30) NOT NULL DEFAULT 'submitted',
    provider_claim_id   VARCHAR(100),
    reviewed_at         TIMESTAMPTZ,
    resolution_note     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT order_insurance_claims_one_per_cover UNIQUE (order_insurance_id)
);

CREATE INDEX IF NOT EXISTS idx_order_insurance_claims_order
    ON order_insurance_claims(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_insurance_claims_status
    ON order_insurance_claims(status, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS order_insurance_claims;
