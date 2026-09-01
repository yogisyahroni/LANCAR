-- Courier retention: an auditable retraining workflow for churn-risk couriers.
-- +goose Up
CREATE TABLE IF NOT EXISTS courier_retraining_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    courier_profile_id UUID NOT NULL REFERENCES courier_profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_retraining_actions_courier
    ON courier_retraining_actions(courier_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_retraining_actions_status
    ON courier_retraining_actions(status, scheduled_at);

-- +goose Down
DROP INDEX IF EXISTS idx_courier_retraining_actions_status;
DROP INDEX IF EXISTS idx_courier_retraining_actions_courier;
DROP TABLE IF EXISTS courier_retraining_actions;
