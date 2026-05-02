-- +goose Up
-- ============================================================
-- Migration 00020: Scheduled Reports for BI Automation
-- LANCAR Hyperlocal Relay Platform
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_reports (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(255) NOT NULL,
    frequency         VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    time_slot         TIME NOT NULL,
    day_of_week       SMALLINT CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    day_of_month      SMALLINT CHECK (day_of_month BETWEEN 1 AND 31),
    recipient_emails  TEXT[] NOT NULL,
    query_payload     JSONB DEFAULT '{}',
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run_at       TIMESTAMPTZ
);

CREATE INDEX idx_scheduled_reports_active ON scheduled_reports(is_active) WHERE is_active = TRUE;

-- +goose Down
DROP TABLE IF EXISTS scheduled_reports;
