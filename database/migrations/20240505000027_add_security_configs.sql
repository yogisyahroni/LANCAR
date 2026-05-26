-- +goose Up
-- ============================================================
-- Migration 20240505000027: Add Security and Missing Configs
-- ============================================================

INSERT INTO system_configs (key, value, description, category) VALUES
('insurance_provider', '"Internal / Managed"', 'Active insurance partner for claim settlements', 'insurance'),
('security_public_api_key', 'null', 'Public API key placeholder; set real provider keys from environment or admin config, never from migrations', 'security'),
('security_force_2fa', 'false', 'Force 2FA/TOTP verification for all admin accounts', 'security'),
('security_session_timeout_h', '24', 'Admin session timeout duration in hours', 'security'),
('security_ip_whitelisting', 'false', 'Enable IP whitelisting for administrative access', 'security')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key IN (
    'insurance_provider',
    'security_public_api_key',
    'security_force_2fa',
    'security_session_timeout_h',
    'security_ip_whitelisting'
);
