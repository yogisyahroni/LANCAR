-- +goose Up
-- FOOD-2026-016: server-authoritative food checkout options.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS cutlery VARCHAR(16) NOT NULL DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS delivery_note TEXT,
    ADD COLUMN IF NOT EXISTS gift_mode BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS receiver_privacy VARCHAR(16) NOT NULL DEFAULT 'standard';

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_cutlery_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_cutlery_check
            CHECK (cutlery IN ('yes', 'no', 'default'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_receiver_privacy_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_receiver_privacy_check
            CHECK (receiver_privacy IN ('standard', 'contactless', 'doorstep'));
    END IF;
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_orders_receiver_privacy
    ON orders (receiver_privacy)
    WHERE service_sub_type = 'food_delivery';

-- +goose Down
DROP INDEX IF EXISTS idx_orders_receiver_privacy;
ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_cutlery_check,
    DROP CONSTRAINT IF EXISTS orders_receiver_privacy_check,
    DROP COLUMN IF EXISTS cutlery,
    DROP COLUMN IF EXISTS delivery_note,
    DROP COLUMN IF EXISTS gift_mode,
    DROP COLUMN IF EXISTS receiver_privacy;
