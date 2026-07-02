-- +goose Up
ALTER TABLE users
ADD COLUMN suspended_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- +goose Down
ALTER TABLE users
DROP COLUMN suspended_until;
