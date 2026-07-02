-- +goose Up
-- +goose StatementBegin
ALTER TABLE courier_sos_incidents ADD COLUMN is_tampered BOOLEAN DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE courier_sos_incidents DROP COLUMN is_tampered;
-- +goose StatementEnd
