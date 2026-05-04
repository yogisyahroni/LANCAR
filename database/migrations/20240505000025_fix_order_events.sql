-- +goose Up
-- +goose StatementBegin
ALTER TABLE order_events RENAME COLUMN status TO event_type;
ALTER TABLE order_events RENAME COLUMN message TO description;
ALTER TABLE order_events ADD COLUMN IF NOT EXISTS metadata JSONB;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE order_events RENAME COLUMN event_type TO status;
ALTER TABLE order_events RENAME COLUMN description TO message;
ALTER TABLE order_events DROP COLUMN IF EXISTS metadata;
-- +goose StatementEnd
