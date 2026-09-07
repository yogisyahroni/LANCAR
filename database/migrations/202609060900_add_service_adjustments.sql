-- +goose Up
-- Historical short-timestamp compatibility version. The complete schema is
-- installed by 20260906090000_add_service_adjustments.sql after its prerequisites.
-- Preserve this version for databases that already recorded it.
SELECT 1;

-- +goose Down
SELECT 1;
