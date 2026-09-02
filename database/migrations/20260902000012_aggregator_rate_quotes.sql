-- +goose Up
-- AGG-2026-003: immutable server-owned carrier rate snapshots.
CREATE TABLE IF NOT EXISTS aggregator_rate_quotes (
    id                    UUID PRIMARY KEY,
    provider_code         VARCHAR(40) NOT NULL,
    origin_code           VARCHAR(100) NOT NULL,
    destination_code      VARCHAR(100) NOT NULL,
    chargeable_weight_kg  NUMERIC(10,3) NOT NULL CHECK (chargeable_weight_kg > 0),
    length_cm             NUMERIC(10,2) NOT NULL DEFAULT 0,
    width_cm              NUMERIC(10,2) NOT NULL DEFAULT 0,
    height_cm             NUMERIC(10,2) NOT NULL DEFAULT 0,
    item_value_idr        BIGINT NOT NULL DEFAULT 0 CHECK (item_value_idr >= 0),
    category              VARCHAR(100) NOT NULL DEFAULT '',
    insurance             BOOLEAN NOT NULL DEFAULT FALSE,
    cod                   BOOLEAN NOT NULL DEFAULT FALSE,
    service_code          VARCHAR(80) NOT NULL,
    service_name          VARCHAR(160) NOT NULL,
    normalized_category   VARCHAR(80) NOT NULL DEFAULT '',
    tariff_gross_idr      BIGINT NOT NULL CHECK (tariff_gross_idr > 0),
    tariff_net_idr        BIGINT NOT NULL CHECK (tariff_net_idr > 0),
    customer_tariff_idr   BIGINT NOT NULL CHECK (customer_tariff_idr > 0),
    eta                   VARCHAR(80) NOT NULL DEFAULT '',
    eta_source            VARCHAR(80) NOT NULL DEFAULT '',
    rule_version          VARCHAR(40) NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aggregator_rate_quotes_expiry
    ON aggregator_rate_quotes (expires_at);
CREATE INDEX IF NOT EXISTS idx_aggregator_rate_quotes_route
    ON aggregator_rate_quotes (provider_code, origin_code, destination_code, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS aggregator_rate_quotes;
