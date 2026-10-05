-- +goose Up
-- Merchant Android individual onboarding must capture both the commercial
-- agreement and the privacy notice through the canonical append-only consent
-- boundary before a registration is submitted.
INSERT INTO market_compliance_requirements (
  market_code, role_code, requirement_code, requirement_kind,
  document_type, document_version, locale, purpose, policy_version
)
VALUES
  ('id-jk', 'merchant', 'merchant_terms', 'consent', 'merchant_terms', 'merchant-terms-2026.1', 'id-ID', 'merchant_operations', 'idjk-2026.1'),
  ('id-jk', 'merchant', 'merchant_privacy_notice', 'consent', 'privacy', 'privacy-2026.1', 'id-ID', 'data_processing', 'idjk-2026.1')
ON CONFLICT (market_code, role_code, requirement_code, policy_version) DO NOTHING;

-- +goose Down
DELETE FROM market_compliance_requirements
WHERE market_code = 'id-jk'
  AND role_code = 'merchant'
  AND policy_version = 'idjk-2026.1'
  AND requirement_code = 'merchant_privacy_notice';
