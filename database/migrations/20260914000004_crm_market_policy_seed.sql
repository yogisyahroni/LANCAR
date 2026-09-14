-- +goose Up
-- CRM-2026-001/002/011: provide the first market-scoped staging policy.
-- These are configuration rows, not a second source of truth. Existing
-- operator-managed rows are never overwritten by this migration.

-- Existing customer accounts created before the CRM boundary may not have an
-- invite code. Derive a stable, non-sensitive code from the UUID so referral
-- attribution can be started without exposing the UUID itself.
UPDATE users
   SET referral_code = 'REF' || UPPER(SUBSTRING(MD5(id::text), 1, 10))
 WHERE role = 'customer'
   AND referral_code IS NULL;

-- Neutral base tier: loyalty points are a benefit liability, not cash, and no
-- discount is granted until a market-approved tier revision is published.
INSERT INTO loyalty_tier_configs
  (market_code, tier_code, min_points, discount_bps, benefits, version, active, effective_from)
SELECT 'id-jk', 'standard', 0, 0, '{"benefits": [], "discount": false}'::jsonb,
       1, TRUE, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM loyalty_tier_configs
   WHERE market_code = 'id-jk' AND tier_code = 'standard' AND version = 1
);

-- Non-cash staging referral policy. The qualifying event and risk review
-- boundary are explicit; Finance/Product can publish a later version before
-- any production launch.
INSERT INTO crm_referral_policies
  (market_code, policy_version, reward_type, reward_points, reward_liability_minor,
   qualifying_rules, active, effective_from)
SELECT 'id-jk', 'referral-2026-v1', 'POINTS', 100, 0,
       '{"qualifying_event": "first_completed_order", "anti_abuse": "risk_review", "market": "id-jk"}'::jsonb,
       TRUE, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM crm_referral_policies
   WHERE market_code = 'id-jk' AND policy_version = 'referral-2026-v1'
);

-- +goose Down
-- Do not remove generated invite codes or policy rows automatically: they may
-- already be referenced by attribution/ledger evidence. Use a reviewed
-- compensating migration to retire them.
