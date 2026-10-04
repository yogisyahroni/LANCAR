-- +goose Up
-- MWEB-PORTAL-P0-002: operating-state changes invalidate every product view
-- that can expose merchant availability. The outbox event remains the
-- database-authoritative propagation contract and is idempotent by state
-- version.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION emit_merchant_operating_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.operating_state IS NOT DISTINCT FROM OLD.operating_state
     AND NEW.operating_state_version IS NOT DISTINCT FROM OLD.operating_state_version THEN
    RETURN NEW;
  END IF;

  INSERT INTO event_outbox (aggregate_type, aggregate_id, event_type, event_version, payload, headers)
  VALUES (
    'merchant_operating_state',
    NEW.id,
    'merchant.operating_state.changed',
    1,
    jsonb_build_object(
      'merchant_id', NEW.id,
      'previous_state', OLD.operating_state,
      'state', NEW.operating_state,
      'is_open', NEW.is_open,
      'reason', NEW.operating_state_reason,
      'effective_until', NEW.operating_state_until,
      'source', NEW.operating_state_source,
      'state_version', NEW.operating_state_version,
      'updated_at', NEW.updated_at
    ),
    jsonb_build_object(
      'consumers', jsonb_build_array(
        'search-index', 'ads-eligibility', 'order-service', 'courier',
        'merchant-android', 'merchant-web', 'admin'
      ),
      'source_of_truth', 'merchant-service'
    )
  );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- The existing trigger/function is retained; this migration only makes the
-- consumer contract explicit for customer, courier, merchant, admin and
-- order read models.
COMMENT ON FUNCTION emit_merchant_operating_state_change() IS
'Consumers: search-index, ads-eligibility, order-service, courier, merchant-android, merchant-web, admin; dedupe by merchant_id + state_version.';

-- +goose Down
-- Restore the previous consumer set while retaining the canonical trigger.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION emit_merchant_operating_state_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.operating_state IS NOT DISTINCT FROM OLD.operating_state
     AND NEW.operating_state_version IS NOT DISTINCT FROM OLD.operating_state_version THEN
    RETURN NEW;
  END IF;
  INSERT INTO event_outbox (aggregate_type, aggregate_id, event_type, event_version, payload, headers)
  VALUES (
    'merchant_operating_state', NEW.id, 'merchant.operating_state.changed', 1,
    jsonb_build_object(
      'merchant_id', NEW.id,
      'previous_state', OLD.operating_state,
      'state', NEW.operating_state,
      'reason', NEW.operating_state_reason,
      'effective_until', NEW.operating_state_until,
      'source', NEW.operating_state_source,
      'state_version', NEW.operating_state_version,
      'updated_at', NEW.updated_at
    ),
    jsonb_build_object(
      'consumers', jsonb_build_array('search-index', 'ads-eligibility'),
      'source_of_truth', 'merchant-service'
    )
  );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd
