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
          WHEN 'lancar_priority' THEN 'tembus_priority'
          WHEN 'lancar_instant' THEN 'tembus_instant'
          WHEN 'lancar_hemat' THEN 'tembus_hemat'
          WHEN 'lancar_same_day' THEN 'tembus_same_day'
          WHEN 'lancar_mobil' THEN 'tembus_mobil'
          WHEN 'lancar_reg' THEN 'tembus_reg'
          WHEN 'lancar_yes' THEN 'tembus_yes'
          ELSE code
        END,
        name = replace(name, 'LANCAR', 'TEMBUS'),
        updated_at = NOW()
    WHERE code IN (
      'lancar_priority',
      'lancar_instant',
      'lancar_hemat',
      'lancar_same_day',
      'lancar_mobil',
      'lancar_reg',
      'lancar_yes'
    )
       OR name LIKE '%LANCAR%';
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE orders
    SET service_code = CASE service_code
          WHEN 'lancar_priority' THEN 'tembus_priority'
          WHEN 'lancar_instant' THEN 'tembus_instant'
          WHEN 'lancar_hemat' THEN 'tembus_hemat'
          WHEN 'lancar_same_day' THEN 'tembus_same_day'
          WHEN 'lancar_mobil' THEN 'tembus_mobil'
          WHEN 'lancar_reg' THEN 'tembus_reg'
          WHEN 'lancar_yes' THEN 'tembus_yes'
          WHEN 'LANCAR_PRIORITY' THEN 'TEMBUS_PRIORITY'
          WHEN 'LANCAR_INSTANT' THEN 'TEMBUS_INSTANT'
          WHEN 'LANCAR_HEMAT' THEN 'TEMBUS_HEMAT'
          WHEN 'LANCAR_SAME_DAY' THEN 'TEMBUS_SAME_DAY'
          WHEN 'LANCAR_MOBIL' THEN 'TEMBUS_MOBIL'
          WHEN 'LANCAR_REG' THEN 'TEMBUS_REG'
          WHEN 'LANCAR_YES' THEN 'TEMBUS_YES'
          ELSE service_code
        END,
        updated_at = NOW()
    WHERE service_code IN (
      'lancar_priority',
      'lancar_instant',
      'lancar_hemat',
      'lancar_same_day',
      'lancar_mobil',
      'lancar_reg',
      'lancar_yes',
      'LANCAR_PRIORITY',
      'LANCAR_INSTANT',
      'LANCAR_HEMAT',
      'LANCAR_SAME_DAY',
      'LANCAR_MOBIL',
      'LANCAR_REG',
      'LANCAR_YES'
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
              replace(service_snapshot::text, 'lancar_', 'tembus_'),
              'LANCAR_',
              'TEMBUS_'
            ),
            'LANCAR',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE service_snapshot::text ILIKE '%lancar%';
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
              replace(settlement_snapshot::text, 'lancar_', 'tembus_'),
              'LANCAR_',
              'TEMBUS_'
            ),
            'LANCAR',
            'TEMBUS'
          )::jsonb,
          updated_at = NOW()
      WHERE settlement_snapshot::text ILIKE '%lancar%';
    END IF;
  END IF;

  IF to_regclass('public.notification_templates') IS NOT NULL THEN
    UPDATE notification_templates
    SET title = replace(title, 'LANCAR', 'TEMBUS'),
        body = replace(body, 'LANCAR', 'TEMBUS')
    WHERE title LIKE '%LANCAR%' OR body LIKE '%LANCAR%';
  END IF;

  IF to_regclass('public.vouchers') IS NOT NULL THEN
    UPDATE vouchers
    SET code = 'TEMBUS10',
        name = replace(name, 'LANCAR', 'TEMBUS')
    WHERE code = 'LANCAR10'
      AND NOT EXISTS (SELECT 1 FROM vouchers WHERE code = 'TEMBUS10');

    UPDATE vouchers
    SET name = replace(name, 'LANCAR', 'TEMBUS')
    WHERE name LIKE '%LANCAR%';
  END IF;

  IF to_regclass('public.system_configs') IS NOT NULL THEN
    UPDATE system_configs
    SET value = '"TEMBUS Logistics Hub"'::jsonb,
        updated_at = NOW()
    WHERE key = 'platform_name'
      AND value::text ILIKE '%lancar%';

    UPDATE system_configs
    SET value = '"ops@tembus.id"'::jsonb,
        updated_at = NOW()
    WHERE key = 'support_email'
      AND value::text ILIKE '%lancar%';

    UPDATE system_configs
    SET value = replace(value::text, 'LANCAR', 'TEMBUS')::jsonb,
        updated_at = NOW()
    WHERE key = 'mobile_update_url'
      AND value::text ILIKE '%lancar%';
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers
    SET email = replace(email, '@lancar.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
      AND NOT EXISTS (
        SELECT 1
        FROM customers existing
        WHERE existing.email = replace(customers.email, '@lancar.id', '@tembus.id')
      );
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
    SET email = replace(email, '@lancar.id', '@tembus.id'),
        updated_at = NOW()
    WHERE email IN ('customer@lancar.id', 'customer.mobile@lancar.id')
      AND NOT EXISTS (
        SELECT 1
        FROM users existing
        WHERE existing.email = replace(users.email, '@lancar.id', '@tembus.id')
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
          WHEN 'tembus_priority' THEN 'lancar_priority'
          WHEN 'tembus_instant' THEN 'lancar_instant'
          WHEN 'tembus_hemat' THEN 'lancar_hemat'
          WHEN 'tembus_same_day' THEN 'lancar_same_day'
          WHEN 'tembus_mobil' THEN 'lancar_mobil'
          WHEN 'tembus_reg' THEN 'lancar_reg'
          WHEN 'tembus_yes' THEN 'lancar_yes'
          ELSE code
        END,
        name = replace(name, 'TEMBUS', 'LANCAR'),
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
          WHEN 'tembus_priority' THEN 'lancar_priority'
          WHEN 'tembus_instant' THEN 'lancar_instant'
          WHEN 'tembus_hemat' THEN 'lancar_hemat'
          WHEN 'tembus_same_day' THEN 'lancar_same_day'
          WHEN 'tembus_mobil' THEN 'lancar_mobil'
          WHEN 'tembus_reg' THEN 'lancar_reg'
          WHEN 'tembus_yes' THEN 'lancar_yes'
          WHEN 'TEMBUS_PRIORITY' THEN 'LANCAR_PRIORITY'
          WHEN 'TEMBUS_INSTANT' THEN 'LANCAR_INSTANT'
          WHEN 'TEMBUS_HEMAT' THEN 'LANCAR_HEMAT'
          WHEN 'TEMBUS_SAME_DAY' THEN 'LANCAR_SAME_DAY'
          WHEN 'TEMBUS_MOBIL' THEN 'LANCAR_MOBIL'
          WHEN 'TEMBUS_REG' THEN 'LANCAR_REG'
          WHEN 'TEMBUS_YES' THEN 'LANCAR_YES'
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
              replace(service_snapshot::text, 'tembus_', 'lancar_'),
              'TEMBUS_',
              'LANCAR_'
            ),
            'TEMBUS',
            'LANCAR'
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
              replace(settlement_snapshot::text, 'tembus_', 'lancar_'),
              'TEMBUS_',
              'LANCAR_'
            ),
            'TEMBUS',
            'LANCAR'
          )::jsonb,
          updated_at = NOW()
      WHERE settlement_snapshot::text ILIKE '%tembus%';
    END IF;
  END IF;

  IF to_regclass('public.notification_templates') IS NOT NULL THEN
    UPDATE notification_templates
    SET title = replace(title, 'TEMBUS', 'LANCAR'),
        body = replace(body, 'TEMBUS', 'LANCAR')
    WHERE title LIKE '%TEMBUS%' OR body LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.vouchers') IS NOT NULL THEN
    UPDATE vouchers
    SET code = 'LANCAR10',
        name = replace(name, 'TEMBUS', 'LANCAR')
    WHERE code = 'TEMBUS10'
      AND NOT EXISTS (SELECT 1 FROM vouchers WHERE code = 'LANCAR10');

    UPDATE vouchers
    SET name = replace(name, 'TEMBUS', 'LANCAR')
    WHERE name LIKE '%TEMBUS%';
  END IF;

  IF to_regclass('public.system_configs') IS NOT NULL THEN
    UPDATE system_configs
    SET value = '"LANCAR Logistics Hub"'::jsonb,
        updated_at = NOW()
    WHERE key = 'platform_name'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = '"ops@lancar.com"'::jsonb,
        updated_at = NOW()
    WHERE key = 'support_email'
      AND value::text ILIKE '%tembus%';

    UPDATE system_configs
    SET value = replace(value::text, 'TEMBUS', 'LANCAR')::jsonb,
        updated_at = NOW()
    WHERE key = 'mobile_update_url'
      AND value::text ILIKE '%tembus%';
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE customers
    SET email = replace(email, '@tembus.id', '@lancar.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM customers existing
        WHERE existing.email = replace(customers.email, '@tembus.id', '@lancar.id')
      );
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE users
    SET email = replace(email, '@tembus.id', '@lancar.id'),
        updated_at = NOW()
    WHERE email IN ('customer@tembus.id', 'customer.mobile@tembus.id')
      AND NOT EXISTS (
        SELECT 1
        FROM users existing
        WHERE existing.email = replace(users.email, '@tembus.id', '@lancar.id')
      );
  END IF;
END $$;
-- +goose StatementEnd
