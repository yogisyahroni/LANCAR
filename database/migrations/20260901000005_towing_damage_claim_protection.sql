-- +goose Up
-- TOW-2026-005: bind towing evidence to the selected vehicle and preserve
-- an auditable damage-claim/liability/compensation workflow.

ALTER TABLE order_legs
    ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES courier_vehicles(id);

ALTER TABLE towing_reports
    ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES courier_vehicles(id);

CREATE TABLE IF NOT EXISTS towing_damage_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    towing_report_id UUID NOT NULL REFERENCES towing_reports(id),
    vehicle_id UUID NOT NULL REFERENCES courier_vehicles(id),
    operator_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'approved', 'rejected', 'paid')),
    severity TEXT NOT NULL
        CHECK (severity IN ('minor', 'major')),
    claim_amount_idr BIGINT NOT NULL CHECK (claim_amount_idr > 0),
    approved_amount_idr BIGINT NOT NULL DEFAULT 0 CHECK (approved_amount_idr >= 0),
    liability_decision TEXT NOT NULL DEFAULT 'pending'
        CHECK (liability_decision IN ('pending', 'operator', 'platform', 'customer', 'shared', 'rejected')),
    liability_decided_by UUID REFERENCES users(id),
    liability_decided_at TIMESTAMPTZ,
    liability_reason TEXT,
    compensation_channel TEXT
        CHECK (compensation_channel IS NULL OR compensation_channel IN ('settlement', 'insurance', 'platform_reserve')),
    compensation_reference TEXT,
    compensated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT towing_damage_claims_one_per_report UNIQUE (towing_report_id),
    CONSTRAINT towing_damage_claims_compensation_reference_required
        CHECK (compensated_at IS NULL OR (compensation_channel IS NOT NULL AND compensation_reference IS NOT NULL AND btrim(compensation_reference) <> '')),
    CONSTRAINT towing_damage_claims_approved_amount_bound
        CHECK (approved_amount_idr <= claim_amount_idr)
);

CREATE INDEX IF NOT EXISTS idx_towing_damage_claims_order
    ON towing_damage_claims(order_id);

CREATE INDEX IF NOT EXISTS idx_towing_damage_claims_status
    ON towing_damage_claims(status, updated_at);

-- +goose Down
DROP TABLE IF EXISTS towing_damage_claims;
ALTER TABLE towing_reports DROP COLUMN IF EXISTS vehicle_id;
ALTER TABLE order_legs DROP COLUMN IF EXISTS vehicle_id;
