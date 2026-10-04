-- +goose Up
-- MWEB-PORTAL-P0-002: auto-accept is a shared merchant fact. Publish the
-- change through the durable outbox so order-service, Merchant Android and
-- portal projections do not rely on local UI state.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION emit_merchant_auto_accept_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.auto_accept_orders IS NOT DISTINCT FROM OLD.auto_accept_orders THEN
    RETURN NEW;
  END IF;

  INSERT INTO event_outbox (aggregate_type, aggregate_id, event_type, event_version, payload, headers)
  VALUES (
    'merchant_order_acceptance',
    NEW.id,
    'merchant.order_acceptance.changed',
    1,
    jsonb_build_object(
      'merchant_id', NEW.id,
      'enabled', NEW.auto_accept_orders,
      'updated_at', NEW.updated_at
    ),
    jsonb_build_object(
      'consumers', jsonb_build_array('order-service', 'merchant-android', 'merchant-web'),
      'source_of_truth', 'merchant-service'
    )
  );
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_emit_merchant_auto_accept_change ON merchants;
CREATE TRIGGER trg_emit_merchant_auto_accept_change
AFTER UPDATE OF auto_accept_orders ON merchants
FOR EACH ROW EXECUTE FUNCTION emit_merchant_auto_accept_change();

-- +goose Down
DROP TRIGGER IF EXISTS trg_emit_merchant_auto_accept_change ON merchants;
DROP FUNCTION IF EXISTS emit_merchant_auto_accept_change();
