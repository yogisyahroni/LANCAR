-- +goose Up
-- TIRE-2026-005: immutable final-report linkage for roadside claims and technician-quality ratings.

CREATE TABLE IF NOT EXISTS roadside_service_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    customer_id UUID NOT NULL,
    courier_id UUID NOT NULL,
    report_id UUID NOT NULL REFERENCES tambal_ban_reports(id),
    report_snapshot JSONB NOT NULL,
    report_snapshot_hash TEXT NOT NULL CHECK (length(report_snapshot_hash) = 64),
    issue_type TEXT NOT NULL CHECK (issue_type IN ('warranty', 'service_quality', 'damage', 'other')),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 2000),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'approved', 'rejected', 'resolved')),
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    correlation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_roadside_service_claims_order
    ON roadside_service_claims(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roadside_service_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    customer_id UUID NOT NULL,
    courier_id UUID NOT NULL,
    report_id UUID NOT NULL REFERENCES tambal_ban_reports(id),
    report_snapshot JSONB NOT NULL,
    report_snapshot_hash TEXT NOT NULL CHECK (length(report_snapshot_hash) = 64),
    overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    technician_quality_rating SMALLINT NOT NULL CHECK (technician_quality_rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    correlation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_roadside_service_ratings_courier
    ON roadside_service_ratings(courier_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_roadside_aftercare_evidence_mutation()
RETURNS trigger AS $$
BEGIN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR NEW.report_id IS DISTINCT FROM OLD.report_id
       OR NEW.report_snapshot IS DISTINCT FROM OLD.report_snapshot
       OR NEW.report_snapshot_hash IS DISTINCT FROM OLD.report_snapshot_hash THEN
        RAISE EXCEPTION 'roadside aftercare evidence linkage is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roadside_claim_evidence_immutable ON roadside_service_claims;
CREATE TRIGGER trg_roadside_claim_evidence_immutable
BEFORE UPDATE ON roadside_service_claims
FOR EACH ROW EXECUTE FUNCTION prevent_roadside_aftercare_evidence_mutation();

DROP TRIGGER IF EXISTS trg_roadside_rating_evidence_immutable ON roadside_service_ratings;
CREATE TRIGGER trg_roadside_rating_evidence_immutable
BEFORE UPDATE ON roadside_service_ratings
FOR EACH ROW EXECUTE FUNCTION prevent_roadside_aftercare_evidence_mutation();

-- +goose Down
DROP TRIGGER IF EXISTS trg_roadside_rating_evidence_immutable ON roadside_service_ratings;
DROP TRIGGER IF EXISTS trg_roadside_claim_evidence_immutable ON roadside_service_claims;
DROP FUNCTION IF EXISTS prevent_roadside_aftercare_evidence_mutation();
DROP TABLE IF EXISTS roadside_service_ratings;
DROP TABLE IF EXISTS roadside_service_claims;
