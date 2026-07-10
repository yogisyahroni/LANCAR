-- +goose Up
-- Migration: create accounting_periods table for RPT-001 Monthly Closing Workflow

CREATE TABLE IF NOT EXISTS accounting_periods (
    period_code VARCHAR(7) PRIMARY KEY, -- format YYYY-MM
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN', -- OPEN, CLOSED
    locked_at TIMESTAMPTZ,
    locked_by UUID,
    closing_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed current and past months
INSERT INTO accounting_periods (period_code, status, created_at, updated_at)
VALUES 
    ('2026-05', 'CLOSED', NOW(), NOW()),
    ('2026-06', 'CLOSED', NOW(), NOW()),
    ('2026-07', 'OPEN', NOW(), NOW())
ON CONFLICT (period_code) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS accounting_periods;
