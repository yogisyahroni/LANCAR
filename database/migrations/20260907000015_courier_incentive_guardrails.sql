-- +goose Up
-- ECON-2026-005: server-authoritative courier incentive campaigns.
-- Existing courier_incentive_campaigns remains the control-plane source.

ALTER TABLE courier_incentive_campaigns
  ADD COLUMN IF NOT EXISTS market_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id),
  ADD COLUMN IF NOT EXISTS service_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cohort_code VARCHAR(40) NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS budget_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_reserved_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_reconciled_idr BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(80) NOT NULL DEFAULT 'courier-incentive-2026-v1',
  ADD COLUMN IF NOT EXISTS max_customer_pair_deliveries INT NOT NULL DEFAULT 10;

UPDATE courier_incentive_campaigns
SET budget_idr = GREATEST(budget_idr, reward_idr::BIGINT),
    budget_reserved_idr = GREATEST(budget_reserved_idr, 0),
    budget_reconciled_idr = GREATEST(budget_reconciled_idr, 0),
    policy_version = COALESCE(NULLIF(BTRIM(policy_version), ''), 'courier-incentive-2026-v1'),
    max_customer_pair_deliveries = GREATEST(max_customer_pair_deliveries, 1);

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courier_incentive_campaigns_budget_check') THEN
    ALTER TABLE courier_incentive_campaigns
      ADD CONSTRAINT courier_incentive_campaigns_budget_check
      CHECK (target_deliveries > 0 AND reward_idr >= 0 AND budget_idr >= 0
             AND budget_reserved_idr >= 0 AND budget_reconciled_idr >= 0
             AND budget_reserved_idr <= budget_idr
             AND max_customer_pair_deliveries > 0);
  END IF;
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_courier_incentive_campaigns_scope
  ON courier_incentive_campaigns(is_active, market_code, zone_id, service_code, cohort_code, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS courier_incentive_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES courier_incentive_campaigns(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_deliveries INT NOT NULL,
  completed_deliveries INT NOT NULL DEFAULT 0,
  reward_idr BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'earned', 'budget_exhausted', 'disqualified')),
  last_order_id UUID REFERENCES orders(id),
  earned_at TIMESTAMPTZ,
  disqualification_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, courier_id),
  CHECK (target_deliveries > 0),
  CHECK (completed_deliveries >= 0 AND completed_deliveries <= target_deliveries),
  CHECK (reward_idr >= 0)
);

CREATE INDEX IF NOT EXISTS idx_courier_incentive_progress_courier
  ON courier_incentive_progress(courier_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS courier_incentive_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES courier_incentive_campaigns(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_leg_id UUID NOT NULL REFERENCES order_legs(id) ON DELETE CASCADE,
  eligible BOOLEAN NOT NULL DEFAULT FALSE,
  decision VARCHAR(40) NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, courier_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_courier_incentive_events_campaign
  ON courier_incentive_events(campaign_id, eligible, created_at DESC);

CREATE TABLE IF NOT EXISTS courier_incentive_liabilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES courier_incentive_campaigns(id) ON DELETE CASCADE,
  courier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_id UUID NOT NULL REFERENCES courier_incentive_progress(id) ON DELETE RESTRICT,
  amount_idr BIGINT NOT NULL CHECK (amount_idr >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'reconciled', 'void')),
  policy_version VARCHAR(80) NOT NULL,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (campaign_id, courier_id)
);

CREATE INDEX IF NOT EXISTS idx_courier_incentive_liabilities_status
  ON courier_incentive_liabilities(campaign_id, status, reserved_at DESC);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION validate_courier_incentive_campaign()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  window_hours NUMERIC;
  safe_target INT;
BEGIN
  IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'courier incentive schedule must have ends_at after starts_at';
  END IF;
  IF NEW.target_deliveries <= 0 THEN
    RAISE EXCEPTION 'courier incentive target must be positive';
  END IF;
  IF NEW.reward_idr < 0 OR NEW.budget_idr < 0 OR NEW.max_customer_pair_deliveries <= 0 THEN
    RAISE EXCEPTION 'courier incentive economics are invalid';
  END IF;

  -- A target may not demand more than two completed deliveries per scheduled
  -- hour. This is a deterministic supply-safety ceiling, not a promise that
  -- every route can be completed at that speed.
  window_hours := EXTRACT(EPOCH FROM (NEW.ends_at - NEW.starts_at)) / 3600;
  safe_target := GREATEST(1, CEIL(window_hours * 2)::INT);
  IF NEW.target_deliveries > safe_target THEN
    RAISE EXCEPTION 'courier incentive target exceeds safe schedule capacity';
  END IF;
  IF NEW.budget_reserved_idr > NEW.budget_idr THEN
    RAISE EXCEPTION 'courier incentive budget reservation exceeds budget';
  END IF;
  NEW.cohort_code := COALESCE(NULLIF(BTRIM(NEW.cohort_code), ''), 'all');
  NEW.policy_version := COALESCE(NULLIF(BTRIM(NEW.policy_version), ''), 'courier-incentive-2026-v1');
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS validate_courier_incentive_campaign_trigger ON courier_incentive_campaigns;
CREATE TRIGGER validate_courier_incentive_campaign_trigger
  BEFORE INSERT OR UPDATE ON courier_incentive_campaigns
  FOR EACH ROW EXECUTE FUNCTION validate_courier_incentive_campaign();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION apply_courier_incentive_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  order_customer_id UUID;
  order_merchant_id UUID;
  order_service_code VARCHAR(50);
  order_market_code VARCHAR(32);
  courier_role VARCHAR(20);
  courier_tier VARCHAR(20);
  campaign_row RECORD;
  progress_row RECORD;
  event_id UUID;
  reservation_id UUID;
  prior_pair_deliveries INT;
  event_time TIMESTAMPTZ := COALESCE(NEW.completed_at, NOW());
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status IS NOT DISTINCT FROM 'delivered' OR NEW.courier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.customer_id, o.merchant_id, o.service_code, z.market_code,
         u.role, cp.tier
    INTO order_customer_id, order_merchant_id, order_service_code,
         order_market_code, courier_role, courier_tier
    FROM orders o
    JOIN users u ON u.id = NEW.courier_id
    LEFT JOIN courier_profiles cp ON cp.user_id = NEW.courier_id
    LEFT JOIN zones z ON z.id = NEW.zone_id
   WHERE o.id = NEW.order_id;

  IF courier_role IS DISTINCT FROM 'courier' OR courier_tier IS NULL THEN
    RETURN NEW;
  END IF;

  FOR campaign_row IN
    SELECT c.*
      FROM courier_incentive_campaigns c
     WHERE c.is_active = TRUE
       AND event_time >= c.starts_at
       AND event_time <= c.ends_at
       AND (c.market_code IS NULL OR c.market_code = order_market_code)
       AND (c.zone_id IS NULL OR c.zone_id = NEW.zone_id)
       AND (c.service_code IS NULL OR c.service_code = order_service_code)
       AND (c.cohort_code = 'all' OR c.cohort_code = courier_tier)
     ORDER BY c.created_at, c.id
  LOOP
    IF order_customer_id = NEW.courier_id OR order_merchant_id = NEW.courier_id THEN
      INSERT INTO courier_incentive_events
        (campaign_id, courier_id, order_id, order_leg_id, eligible, decision, policy_version)
      VALUES
        (campaign_row.id, NEW.courier_id, NEW.order_id, NEW.id, FALSE, 'self_order_rejected', campaign_row.policy_version)
      ON CONFLICT (campaign_id, courier_id, order_id) DO NOTHING;
      CONTINUE;
    END IF;

    SELECT COUNT(*)::INT INTO prior_pair_deliveries
      FROM courier_incentive_events e
      JOIN orders prior_order ON prior_order.id = e.order_id
     WHERE e.campaign_id = campaign_row.id
       AND e.courier_id = NEW.courier_id
       AND e.eligible = TRUE
       AND prior_order.customer_id = order_customer_id;
    IF prior_pair_deliveries >= campaign_row.max_customer_pair_deliveries THEN
      INSERT INTO courier_incentive_events
        (campaign_id, courier_id, order_id, order_leg_id, eligible, decision, policy_version)
      VALUES
        (campaign_row.id, NEW.courier_id, NEW.order_id, NEW.id, FALSE, 'collusion_pair_limit', campaign_row.policy_version)
      ON CONFLICT (campaign_id, courier_id, order_id) DO NOTHING;
      CONTINUE;
    END IF;

    event_id := NULL;
    INSERT INTO courier_incentive_events
      (campaign_id, courier_id, order_id, order_leg_id, eligible, decision, policy_version)
    VALUES
      (campaign_row.id, NEW.courier_id, NEW.order_id, NEW.id, TRUE, 'delivery_counted', campaign_row.policy_version)
    ON CONFLICT (campaign_id, courier_id, order_id) DO NOTHING
    RETURNING id INTO event_id;
    IF event_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO courier_incentive_progress
      (campaign_id, courier_id, target_deliveries, completed_deliveries, reward_idr, last_order_id)
    VALUES
      (campaign_row.id, NEW.courier_id, campaign_row.target_deliveries, 1, campaign_row.reward_idr, NEW.order_id)
    ON CONFLICT (campaign_id, courier_id) DO UPDATE
      SET completed_deliveries = CASE
            WHEN courier_incentive_progress.status = 'in_progress'
              THEN LEAST(courier_incentive_progress.target_deliveries,
                         courier_incentive_progress.completed_deliveries + 1)
            ELSE courier_incentive_progress.completed_deliveries
          END,
          last_order_id = CASE
            WHEN courier_incentive_progress.status = 'in_progress' THEN EXCLUDED.last_order_id
            ELSE courier_incentive_progress.last_order_id
          END,
          updated_at = NOW()
    RETURNING * INTO progress_row;

    IF progress_row.status = 'in_progress'
       AND progress_row.completed_deliveries >= progress_row.target_deliveries THEN
      UPDATE courier_incentive_campaigns
         SET budget_reserved_idr = budget_reserved_idr + campaign_row.reward_idr,
             updated_at = NOW()
       WHERE id = campaign_row.id
         AND budget_reserved_idr + campaign_row.reward_idr <= budget_idr;
      IF FOUND THEN
        reservation_id := NULL;
        INSERT INTO courier_incentive_liabilities
          (campaign_id, courier_id, progress_id, amount_idr, policy_version, metadata)
        VALUES
          (campaign_row.id, NEW.courier_id, progress_row.id, campaign_row.reward_idr,
           campaign_row.policy_version,
           jsonb_build_object('trigger', 'order_leg_delivered', 'order_id', NEW.order_id))
        ON CONFLICT (campaign_id, courier_id) DO NOTHING
        RETURNING id INTO reservation_id;
        IF reservation_id IS NOT NULL THEN
          UPDATE courier_incentive_progress
             SET status = 'earned', earned_at = NOW(), updated_at = NOW()
           WHERE id = progress_row.id;
        END IF;
      ELSE
        UPDATE courier_incentive_progress
           SET status = 'budget_exhausted',
               disqualification_reason = 'campaign_budget_exhausted',
               updated_at = NOW()
         WHERE id = progress_row.id;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS apply_courier_incentive_delivery_trigger ON order_legs;
CREATE TRIGGER apply_courier_incentive_delivery_trigger
  AFTER UPDATE OF status ON order_legs
  FOR EACH ROW EXECUTE FUNCTION apply_courier_incentive_delivery();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION reconcile_courier_incentive_campaign(p_campaign_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  reconciled_total BIGINT;
BEGIN
  UPDATE courier_incentive_liabilities
     SET status = 'reconciled', reconciled_at = NOW()
   WHERE campaign_id = p_campaign_id
     AND status = 'reserved';

  SELECT COALESCE(SUM(amount_idr), 0) INTO reconciled_total
    FROM courier_incentive_liabilities
   WHERE campaign_id = p_campaign_id
     AND status = 'reconciled';

  UPDATE courier_incentive_campaigns
     SET budget_reconciled_idr = reconciled_total, updated_at = NOW()
   WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN reconciled_total;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP TRIGGER IF EXISTS apply_courier_incentive_delivery_trigger ON order_legs;
DROP FUNCTION IF EXISTS apply_courier_incentive_delivery();
DROP TRIGGER IF EXISTS validate_courier_incentive_campaign_trigger ON courier_incentive_campaigns;
DROP FUNCTION IF EXISTS validate_courier_incentive_campaign();
DROP FUNCTION IF EXISTS reconcile_courier_incentive_campaign(UUID);
DROP INDEX IF EXISTS idx_courier_incentive_liabilities_status;
DROP TABLE IF EXISTS courier_incentive_liabilities;
DROP INDEX IF EXISTS idx_courier_incentive_events_campaign;
DROP TABLE IF EXISTS courier_incentive_events;
DROP INDEX IF EXISTS idx_courier_incentive_progress_courier;
DROP TABLE IF EXISTS courier_incentive_progress;
DROP INDEX IF EXISTS idx_courier_incentive_campaigns_scope;
ALTER TABLE courier_incentive_campaigns
  DROP CONSTRAINT IF EXISTS courier_incentive_campaigns_budget_check,
  DROP COLUMN IF EXISTS max_customer_pair_deliveries,
  DROP COLUMN IF EXISTS policy_version,
  DROP COLUMN IF EXISTS budget_reconciled_idr,
  DROP COLUMN IF EXISTS budget_reserved_idr,
  DROP COLUMN IF EXISTS budget_idr,
  DROP COLUMN IF EXISTS cohort_code,
  DROP COLUMN IF EXISTS service_code,
  DROP COLUMN IF EXISTS zone_id,
  DROP COLUMN IF EXISTS market_code;
