-- +goose Up
-- Structured towing damage inspection. Nullable keeps older reports readable.
ALTER TABLE towing_reports
    ADD COLUMN IF NOT EXISTS damage_report JSONB;

-- +goose Down
ALTER TABLE towing_reports
    DROP COLUMN IF EXISTS damage_report;
