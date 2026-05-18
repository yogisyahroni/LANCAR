-- +goose Up
INSERT INTO system_configs (key, value, description, category) VALUES
('payout_emergency_kill_switch_enabled', 'false', 'Emergency switch: stop automatic payout approval and provider dispatch while still accepting requests for manual review', 'finance'),
('payout_bank_hourly_request_limit', '5', 'Maximum payout requests per bank account fingerprint per hour before manual review', 'finance'),
('payout_device_hourly_request_limit', '4', 'Maximum payout requests per device id per hour before manual review', 'finance'),
('payout_ip_hourly_request_limit', '8', 'Maximum payout requests per IP address per hour before manual review', 'finance'),
('payout_bank_daily_auto_limit_idr', '1500000', 'Maximum total auto payout amount per bank account fingerprint per day', 'finance'),
('payout_provider_daily_limit_idr', '50000000', 'Maximum total payout amount dispatched to provider per day', 'finance')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

CREATE INDEX IF NOT EXISTS idx_courier_payout_risk_decisions_device
  ON courier_payout_risk_decisions(device_id, created_at DESC)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courier_payout_risk_decisions_ip
  ON courier_payout_risk_decisions(ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courier_payout_accounts_fingerprint
  ON courier_payout_accounts(account_number_fingerprint)
  WHERE account_number_fingerprint IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_courier_payout_accounts_fingerprint;
DROP INDEX IF EXISTS idx_courier_payout_risk_decisions_ip;
DROP INDEX IF EXISTS idx_courier_payout_risk_decisions_device;

DELETE FROM system_configs
WHERE key IN (
  'payout_emergency_kill_switch_enabled',
  'payout_bank_hourly_request_limit',
  'payout_device_hourly_request_limit',
  'payout_ip_hourly_request_limit',
  'payout_bank_daily_auto_limit_idr',
  'payout_provider_daily_limit_idr'
);
