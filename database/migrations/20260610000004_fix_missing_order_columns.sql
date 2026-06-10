-- +goose Up
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS length DECIMAL(8,2),
    ADD COLUMN IF NOT EXISTS width DECIMAL(8,2),
    ADD COLUMN IF NOT EXISTS height DECIMAL(8,2),
    ADD COLUMN IF NOT EXISTS weight DECIMAL(8,2),
    ADD COLUMN IF NOT EXISTS meeting_point_id UUID REFERENCES meeting_points(id);

ALTER TABLE order_legs
    ADD COLUMN IF NOT EXISTS meeting_point_id UUID REFERENCES meeting_points(id);

-- +goose Down
ALTER TABLE orders
    DROP COLUMN IF EXISTS length,
    DROP COLUMN IF EXISTS width,
    DROP COLUMN IF EXISTS height,
    DROP COLUMN IF EXISTS weight,
    DROP COLUMN IF EXISTS meeting_point_id;

ALTER TABLE order_legs
    DROP COLUMN IF EXISTS meeting_point_id;
