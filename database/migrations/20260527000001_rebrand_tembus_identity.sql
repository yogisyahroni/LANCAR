-- +goose Up
-- +goose StatementBegin
-- Rebrand persisted product/configuration data for databases that were already
-- migrated before the TEMBUS rename. Keep technical package/module identifiers
-- untouched; this migration only changes database-facing brand data.
DO $$
BEGIN
  IF to_regclass('public.delivery_service_products') IS NOT NULL THEN
    UPDATE delivery_service_products
    SET code = CASE code
          WHEN 'tembus_priority' THEN 'tembus_priority'
          WHEN 'tembus_instant' THEN 'tembus_instant'
          WHEN 'tembus_hemat' THEN 'tembus_hemat'
          WHEN 'tembus_same_day' THEN 'tembus_same_day'
          WHEN 'tembus_mobil' THEN 'tembus_mobil'
          WHEN 'tembus_reg' THEN 'tembus_reg'
          WHEN 'tembus_yes' THEN 'tembus_yes'
          ELSE code
        END,
        name = replace(name, 'TEMBUS', 'TEMBUS'),
        updated_at = NOW()
    WHERE code IN (
      'tembus_priority',
      'tembus_instant',
      'tembus_hemat',
      'tembus_same_day',
      'tembus_mobil',
      'tembus_reg',
      'tembus_yes'
    )
       OR name LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE orders
    SET service_code = CASE service_code
          WHEN 'tembus_priority' THEN 'tembus_priority'
          WHEN 'tembus_instant' THEN 'tembus_instant'
          WHEN 'tembus_hemat' THEN 'tembus_hemat'
          WHEN 'tembus_same_day' THEN 'tembus_same_day'
          WHEN 'tembus_mobil' THEN 'tembus_mobil'
          WHEN 'tembus_reg' THEN 'tembus_reg'
          WHEN 'tembus_yes' THEN 'tembus_yes'
          WHEN 'TEMBUS_PRIORITY' THEN 'TEMBUS_PRIORITY'
          WHEN 'TEMBUS_INSTANT' THEN 'TEMBUS_INSTANT'
          WHEN 'TEMBUS_HEMAT' THEN 'TEMBUS_HEMAT'
          WHEN 'TEMBUS_SAME_DAY' THEN 'TEMBUS_SAME_DAY'
          WHEN 'TEMBUS_MOBIL' THEN 'TEMBUS_MOBIL'
          WHEN 'TEMBUS_REG' THEN 'TEMBUS_REG'
          WHEN 'TEMBUS_YES' THEN 'TEMBUS_YES'
          ELSE service_code
        END,
        updated_at = NOW()
    WHERE service_code IN (
      'tembus_priority',
      'tembus_instant',
      'tembus_hemat',
      'tembus_same_day',
      'tembus_mobil',
      'tembus_reg',
      'tembus_yes',
      'TEMBUS_PRIORITY',
      'TEMBUS_INSTANT',
      'TEMBUS_HEMAT',
      'TEMBUS_SAME_DAY',
      'TEMBUS_MOBIL',
      'TEMBUS_REG',
      'TEMBUS_YES'
    );

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'service_snapshot'
    ) THEN
      UPDATE orders
      SET service_snapshot = replace(
            replace(
              replace(service_snapshot::text, 'tembus_', 'tembus_'),
              'TEMBUS_',
              'TEMBUS_'
            ),
            'TEMBUS',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE service_snapshot::text ILIKE '%tembus%';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'settlement_snapshot'
    ) THEN
      UPDATE orders
      SET settlement_snapshot = replace(
            replace(
              replace(settlement_snapshot::text, 'tembus_', 'tembus_'),
              'TEMBUS_',
              'TEMBUS_'
            ),
            'TEMBUS',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE settlement_snapshot::text ILIKE '%tembus%';
    END IF;
  END IF;

  IF to_regclass('public.notification_templates') IS NOT NULL THEN
    UPDATE notification_templates
    SET title = replace(title, 'TEMBUS', 'TEMBUS'),
        body = replace(body, 'TEMBUS', 'TEMBUS')
    WHERE title LIKE '%TEMBUS%' OR body LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.vouchers') IS NOT NULL THEN
    UPDATE vouchers
    SET code = 'TEMBUS10',
        name = replace(name, 'TEMBUS', 'TEMBUS')
    WHERE code = 'TEMBUS10'
      AND NOT EXISTS (SELECT 1 FROM vouchers WHERE code = 'TEMBUS10');

    UPDATE vouchers
    SET name = replace(name, 'TEMBUS', 'TEMBUS')
    WHERE name LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.system_configs') IS NOT NULL THEN
    UPDATE system_configs
    SET value = '"TEMBUS Logistics Hub"'::jsonb,
        updated_at = NOW()
    WHERE key = 'platform_name'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = '"ops@tembus.id"'::jsonb,
        updated_at = NOW()
    WHERE key = 'support_email'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = replace(value::text, 'TEMBUS', 'TEMBUS')::jsonb,
        updated_at = NOW()
    WHERE key = 'mobile_update_url'
      AND value::text ILIKE '%tembus%';
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers
    SET email = replace(email, '@tembus.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM customers existing
        WHERE existing.email = replace(customers.email, '@tembus.id', '@tembus.id')
      );
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
    SET email = replace(email, '@tembus.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM users existing
        WHERE existing.email = replace(users.email, '@tembus.id', '@tembus.id')
      );
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF to_regclass('public.delivery_service_products') IS NOT NULL THEN
    UPDATE delivery_service_products
    SET code = CASE code
          WHEN 'tembus_priority' THEN 'tembus_priority'
          WHEN 'tembus_instant' THEN 'tembus_instant'
          WHEN 'tembus_hemat' THEN 'tembus_hemat'
          WHEN 'tembus_same_day' THEN 'tembus_same_day'
          WHEN 'tembus_mobil' THEN 'tembus_mobil'
          WHEN 'tembus_reg' THEN 'tembus_reg'
          WHEN 'tembus_yes' THEN 'tembus_yes'
          ELSE code
        END,
        name = replace(name, 'TEMBUS', 'TEMBUS'),
        updated_at = NOW()
    WHERE code IN (
      'tembus_priority',
      'tembus_instant',
      'tembus_hemat',
      'tembus_same_day',
      'tembus_mobil',
      'tembus_reg',
      'tembus_yes'
    )
       OR name LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE orders
    SET service_code = CASE service_code
          WHEN 'tembus_priority' THEN 'tembus_priority'
          WHEN 'tembus_instant' THEN 'tembus_instant'
          WHEN 'tembus_hemat' THEN 'tembus_hemat'
          WHEN 'tembus_same_day' THEN 'tembus_same_day'
          WHEN 'tembus_mobil' THEN 'tembus_mobil'
          WHEN 'tembus_reg' THEN 'tembus_reg'
          WHEN 'tembus_yes' THEN 'tembus_yes'
          WHEN 'TEMBUS_PRIORITY' THEN 'TEMBUS_PRIORITY'
          WHEN 'TEMBUS_INSTANT' THEN 'TEMBUS_INSTANT'
          WHEN 'TEMBUS_HEMAT' THEN 'TEMBUS_HEMAT'
          WHEN 'TEMBUS_SAME_DAY' THEN 'TEMBUS_SAME_DAY'
          WHEN 'TEMBUS_MOBIL' THEN 'TEMBUS_MOBIL'
          WHEN 'TEMBUS_REG' THEN 'TEMBUS_REG'
          WHEN 'TEMBUS_YES' THEN 'TEMBUS_YES'
          ELSE service_code
        END,
        updated_at = NOW()
    WHERE service_code IN (
      'tembus_priority',
      'tembus_instant',
      'tembus_hemat',
      'tembus_same_day',
      'tembus_mobil',
      'tembus_reg',
      'tembus_yes',
      'TEMBUS_PRIORITY',
      'TEMBUS_INSTANT',
      'TEMBUS_HEMAT',
      'TEMBUS_SAME_DAY',
      'TEMBUS_MOBIL',
      'TEMBUS_REG',
      'TEMBUS_YES'
    );

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'service_snapshot'
    ) THEN
      UPDATE orders
      SET service_snapshot = replace(
            replace(
              replace(service_snapshot::text, 'tembus_', 'tembus_'),
              'TEMBUS_',
              'TEMBUS_'
            ),
            'TEMBUS',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE service_snapshot::text ILIKE '%tembus%';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'settlement_snapshot'
    ) THEN
      UPDATE orders
      SET settlement_snapshot = replace(
            replace(
              replace(settlement_snapshot::text, 'tembus_', 'tembus_'),
              'TEMBUS_',
              'TEMBUS_'
            ),
            'TEMBUS',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE settlement_snapshot::text ILIKE '%tembus%';
    END IF;
  END IF;

  IF to_regclass('public.notification_templates') IS NOT NULL THEN
    UPDATE notification_templates
    SET title = replace(title, 'TEMBUS', 'TEMBUS'),
        body = replace(body, 'TEMBUS', 'TEMBUS')
    WHERE title LIKE '%TEMBUS%' OR body LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.vouchers') IS NOT NULL THEN
    UPDATE vouchers
    SET code = 'TEMBUS10',
        name = replace(name, 'TEMBUS', 'TEMBUS')
    WHERE code = 'TEMBUS10'
      AND NOT EXISTS (SELECT 1 FROM vouchers WHERE code = 'TEMBUS10');

    UPDATE vouchers
    SET name = replace(name, 'TEMBUS', 'TEMBUS')
    WHERE name LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.system_configs') IS NOT NULL THEN
    UPDATE system_configs
    SET value = '"TEMBUS Logistics Hub"'::jsonb,
        updated_at = NOW()
    WHERE key = 'platform_name'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = '"ops@tembus.com"'::jsonb,
        updated_at = NOW()
    WHERE key = 'support_email'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = replace(value::text, 'TEMBUS', 'TEMBUS')::jsonb,
        updated_at = NOW()
    WHERE key = 'mobile_update_url'
      AND value::text ILIKE '%tembus%';
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers
    SET email = replace(email, '@tembus.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM customers existing
        WHERE existing.email = replace(customers.email, '@tembus.id', '@tembus.id')
      );
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
    SET email = replace(email, '@tembus.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM users existing
        WHERE existing.email = replace(users.email, '@tembus.id', '@tembus.id')
      );
  END IF;
END $$;
-- +goose StatementEnd
