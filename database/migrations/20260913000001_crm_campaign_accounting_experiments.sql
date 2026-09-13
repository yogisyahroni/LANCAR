-- +goose Up
-- CRM campaign accounting and experiment metadata remain projections around
-- canonical order/payment truth. These columns make the financial/experiment
-- contract explicit without creating a second ledger.
ALTER TABLE crm_campaigns
  ADD COLUMN IF NOT EXISTS budget_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS merchant_agreement_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS promo_subsidy_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ads_spend_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guardrail_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_promo_subsidy_minor_check,
  ADD CONSTRAINT crm_campaigns_promo_subsidy_minor_check CHECK (promo_subsidy_minor >= 0),
  DROP CONSTRAINT IF EXISTS crm_campaigns_ads_spend_minor_check,
  ADD CONSTRAINT crm_campaigns_ads_spend_minor_check CHECK (ads_spend_minor >= 0);

ALTER TABLE crm_campaign_reservations
  ADD COLUMN IF NOT EXISTS promo_subsidy_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ads_spend_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_reference VARCHAR(128),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

ALTER TABLE crm_campaign_reservations
  DROP CONSTRAINT IF EXISTS crm_campaign_reservations_promo_subsidy_check,
  ADD CONSTRAINT crm_campaign_reservations_promo_subsidy_check CHECK (promo_subsidy_minor >= 0),
  DROP CONSTRAINT IF EXISTS crm_campaign_reservations_ads_spend_check,
  ADD CONSTRAINT crm_campaign_reservations_ads_spend_check CHECK (ads_spend_minor >= 0);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_schedule
  ON crm_campaigns(state, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_reservations_settlement
  ON crm_campaign_reservations(state, settled_at, created_at);

-- +goose Down
-- Financial history must not be silently discarded during rollback.
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM crm_campaign_reservations LIMIT 1)
     OR EXISTS (SELECT 1 FROM crm_campaigns WHERE budget_version IS NOT NULL
                                      OR merchant_agreement_version IS NOT NULL
                                      OR promo_subsidy_minor <> 0
                                      OR ads_spend_minor <> 0)
  THEN
    RAISE EXCEPTION 'CRM campaign accounting contains history; use a reviewed compensating migration';
  END IF;
END $$;
-- +goose StatementEnd
DROP INDEX IF EXISTS idx_crm_campaign_reservations_settlement;
DROP INDEX IF EXISTS idx_crm_campaigns_schedule;
ALTER TABLE crm_campaign_reservations
  DROP CONSTRAINT IF EXISTS crm_campaign_reservations_ads_spend_check,
  DROP CONSTRAINT IF EXISTS crm_campaign_reservations_promo_subsidy_check,
  DROP COLUMN IF EXISTS settled_at,
  DROP COLUMN IF EXISTS settlement_reference,
  DROP COLUMN IF EXISTS ads_spend_minor,
  DROP COLUMN IF EXISTS promo_subsidy_minor;
ALTER TABLE crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_ads_spend_minor_check,
  DROP CONSTRAINT IF EXISTS crm_campaigns_promo_subsidy_minor_check,
  DROP COLUMN IF EXISTS guardrail_policy,
  DROP COLUMN IF EXISTS ads_spend_minor,
  DROP COLUMN IF EXISTS promo_subsidy_minor,
  DROP COLUMN IF EXISTS merchant_agreement_version,
  DROP COLUMN IF EXISTS budget_version;
