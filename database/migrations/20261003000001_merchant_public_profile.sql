-- MERCH-2026-009: public merchant profile metadata used by the merchant app.
-- Branch identity remains canonical in merchant_branches; this table only owns
-- presentation metadata that is not part of KYB or operating state.

-- +goose Up

CREATE TABLE IF NOT EXISTS merchant_profile_details (
    merchant_id          UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    short_description    VARCHAR(200) NOT NULL DEFAULT '',
    primary_categories   TEXT[] NOT NULL DEFAULT '{}'::text[],
    banner_url           TEXT,
    logo_url             TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT merchant_profile_categories_limit
        CHECK (cardinality(primary_categories) <= 5)
);

-- Existing merchants receive an empty, server-owned record. No display data is
-- invented; the app renders an explicit empty state until the owner fills it.
INSERT INTO merchant_profile_details (merchant_id)
SELECT id FROM merchants
ON CONFLICT (merchant_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_merchant_profile_details_updated
    ON merchant_profile_details (updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS merchant_profile_details;
