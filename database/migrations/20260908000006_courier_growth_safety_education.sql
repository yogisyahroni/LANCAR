-- +goose Up
-- COURIER-2026-007: enforce safe incentive mechanics and expose read-only
-- education modules through the existing courier growth/performance contract.

-- Campaign configuration remains in courier_incentive_campaigns. This trigger
-- rejects mechanics that could reward speeding or unsafe driving and stamps a
-- server-owned safety policy marker for API clients.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION guard_courier_incentive_safety()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  mechanic TEXT;
BEGIN
  mechanic := lower(COALESCE(NULLIF(BTRIM(NEW.metadata->>'mechanic'), ''), 'delivery_count'));
  IF mechanic NOT IN ('delivery_count', 'completion_quality') THEN
    RAISE EXCEPTION 'courier incentive mechanic is not safe for driving';
  END IF;

  IF lower(COALESCE(NEW.metadata->>'requires_speeding', 'false')) IN ('true', '1', 'yes')
     OR lower(COALESCE(NEW.metadata->>'unsafe_driving', 'false')) IN ('true', '1', 'yes') THEN
    RAISE EXCEPTION 'courier incentive cannot reward unsafe driving';
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'mechanic', mechanic,
      'safe_for_driving', TRUE,
      'safety_policy_version', 'courier-growth-safety-2026-v1'
    );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS guard_courier_incentive_safety_trigger ON courier_incentive_campaigns;
CREATE TRIGGER guard_courier_incentive_safety_trigger
  BEFORE INSERT OR UPDATE ON courier_incentive_campaigns
  FOR EACH ROW EXECUTE FUNCTION guard_courier_incentive_safety();

-- +goose Down
DROP TRIGGER IF EXISTS guard_courier_incentive_safety_trigger ON courier_incentive_campaigns;
DROP FUNCTION IF EXISTS guard_courier_incentive_safety();
