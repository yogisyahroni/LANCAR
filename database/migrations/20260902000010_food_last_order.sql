-- +goose Up
ALTER TABLE merchant_operating_hours
    ADD COLUMN IF NOT EXISTS last_order_minutes_before_close SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE merchant_operating_hours
    DROP CONSTRAINT IF EXISTS merchant_operating_hours_last_order_minutes_check;

ALTER TABLE merchant_operating_hours
    ADD CONSTRAINT merchant_operating_hours_last_order_minutes_check
    CHECK (last_order_minutes_before_close BETWEEN 0 AND 180);

-- +goose Down
ALTER TABLE merchant_operating_hours
    DROP CONSTRAINT IF EXISTS merchant_operating_hours_last_order_minutes_check;
ALTER TABLE merchant_operating_hours
    DROP COLUMN IF EXISTS last_order_minutes_before_close;
