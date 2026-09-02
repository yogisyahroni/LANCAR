-- +goose Up
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS busy_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS busy_extra_prep_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_busy_extra_prep_minutes_nonnegative;
ALTER TABLE merchants
    ADD CONSTRAINT merchants_busy_extra_prep_minutes_nonnegative
    CHECK (busy_extra_prep_minutes >= 0 AND busy_extra_prep_minutes <= 180);

CREATE INDEX IF NOT EXISTS idx_merchants_busy_until
    ON merchants (busy_until)
    WHERE busy_until IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_merchants_busy_until;
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_busy_extra_prep_minutes_nonnegative;
ALTER TABLE merchants
    DROP COLUMN IF EXISTS busy_extra_prep_minutes,
    DROP COLUMN IF EXISTS busy_until;
