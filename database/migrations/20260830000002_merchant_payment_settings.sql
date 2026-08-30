-- +goose Up
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS payout_schedule VARCHAR(16) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS npwp VARCHAR(32) NULL;

ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_payout_schedule_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_payout_schedule_check
  CHECK (payout_schedule IN ('daily', 'weekly', 'monthly'));

-- +goose Down
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_payout_schedule_check;
ALTER TABLE merchants DROP COLUMN IF EXISTS payout_schedule, DROP COLUMN IF EXISTS npwp;
