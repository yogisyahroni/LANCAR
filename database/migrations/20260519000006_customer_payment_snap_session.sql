-- +goose Up
-- +goose StatementBegin
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS snap_token TEXT,
  ADD COLUMN IF NOT EXISTS redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS client_key TEXT,
  ADD COLUMN IF NOT EXISTS snap_js_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_snap_token
  ON payments(snap_token)
  WHERE snap_token IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_payments_snap_token;

ALTER TABLE payments
  DROP COLUMN IF EXISTS snap_js_url,
  DROP COLUMN IF EXISTS client_key,
  DROP COLUMN IF EXISTS redirect_url,
  DROP COLUMN IF EXISTS snap_token;
-- +goose StatementEnd
