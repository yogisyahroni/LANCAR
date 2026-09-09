-- CORE-2026-001 migration smoke test.
-- The fixture is wrapped in a transaction and rolled back so this can run
-- safely against an isolated CI database after the full migration chain.

BEGIN;

DO $$
DECLARE
  expected_category TEXT;
  actual_category TEXT;
  initial_state_version BIGINT;
  transitioned_state_version BIGINT;
  unchanged_state_version BIGINT;
BEGIN
  FOR expected_category, actual_category IN
    SELECT * FROM (VALUES
      ('package_on_demand', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-package')),
      ('food', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-food')),
      ('food', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-snapshot-food')),
      ('tambal_ban', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-tambal')),
      ('towing', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-towing')),
      ('aggregator', (SELECT service_category FROM orders WHERE order_number = 'ci-canonical-aggregator'))
    ) AS categories(expected_category, actual_category)
  LOOP
    IF actual_category IS DISTINCT FROM expected_category THEN
      RAISE EXCEPTION 'canonical category mismatch: expected %, got %', expected_category, actual_category;
    END IF;
  END LOOP;

  SELECT contract_version, state_version
    INTO expected_category, initial_state_version
  FROM orders
  WHERE order_number = 'ci-canonical-food';
  IF expected_category IS DISTINCT FROM '2026-09-01' OR initial_state_version <> 1 THEN
    RAISE EXCEPTION 'canonical defaults mismatch: contract_version=%, state_version=%', expected_category, initial_state_version;
  END IF;

  IF (SELECT service_metadata FROM orders WHERE order_number = 'ci-canonical-food') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'service_metadata default must be an empty JSON object';
  END IF;

  UPDATE orders
  SET status = 'delivering'
  WHERE order_number = 'ci-canonical-food';
  SELECT state_version INTO transitioned_state_version
  FROM orders WHERE order_number = 'ci-canonical-food';
  IF transitioned_state_version <> 2 THEN
    RAISE EXCEPTION 'status transition must increment state_version to 2, got %', transitioned_state_version;
  END IF;

  UPDATE orders
  SET status = 'delivering'
  WHERE order_number = 'ci-canonical-food';
  SELECT state_version INTO unchanged_state_version
  FROM orders WHERE order_number = 'ci-canonical-food';
  IF unchanged_state_version <> 2 THEN
    RAISE EXCEPTION 'same-status update must not increment state_version, got %', unchanged_state_version;
  END IF;

  IF to_regclass('public.idx_orders_canonical_service_category') IS NULL
     OR to_regclass('public.idx_orders_correlation_id') IS NULL THEN
    RAISE EXCEPTION 'canonical order indexes are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND tgname = 'orders_state_version_trigger'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'canonical state_version trigger is missing';
  END IF;
END
$$;

DELETE FROM orders WHERE order_number LIKE 'ci-canonical-%';
DELETE FROM users WHERE phone_number = '+629999000001';

COMMIT;
