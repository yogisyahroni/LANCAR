-- +goose Up
-- +goose StatementBegin
ALTER TABLE courier_profiles ADD COLUMN IF NOT EXISTS liveness_verified BOOLEAN DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE courier_profiles DROP COLUMN IF EXISTS liveness_verified;
-- +goose StatementEnd
