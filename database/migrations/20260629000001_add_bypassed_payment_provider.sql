-- +goose Up
-- +goose StatementBegin
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_provider_supported_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_supported_check
  CHECK (provider IN ('midtrans', 'xendit', 'lapay', 'bypassed'));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_provider_supported_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_supported_check
  CHECK (provider IN ('midtrans', 'xendit', 'lapay'));
-- +goose StatementEnd
