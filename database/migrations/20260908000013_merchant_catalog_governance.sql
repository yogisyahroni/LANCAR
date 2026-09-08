-- +goose Up
-- MERCH-2026-003: canonical catalog entities, moderation, schedules, and
-- versioned Search feed. Existing merchant_menu_items remains the catalog
-- source of truth; the new tables are normalized children/projections.

CREATE TABLE IF NOT EXISTS merchant_menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_categories_merchant
  ON merchant_menu_categories (merchant_id, status, sort_order, name);

ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(16) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

UPDATE merchant_menu_items
SET status = CASE WHEN is_available THEN 'active' ELSE 'sold_out' END,
    moderation_status = 'approved',
    version = GREATEST(version, 1)
;

INSERT INTO merchant_menu_categories (merchant_id, name, slug)
SELECT DISTINCT merchant_id,
       LEFT(BTRIM(kategori), 80),
       LEFT(REGEXP_REPLACE(LOWER(BTRIM(kategori)), '[^a-z0-9]+', '-', 'g'), 80)
FROM merchant_menu_items
WHERE kategori IS NOT NULL
  AND BTRIM(kategori) <> ''
ON CONFLICT (merchant_id, slug) DO NOTHING;

UPDATE merchant_menu_items item
SET category_id = category.id
FROM merchant_menu_categories category
WHERE item.category_id IS NULL
  AND item.merchant_id = category.merchant_id
  AND item.kategori IS NOT NULL
  AND category.slug = LEFT(REGEXP_REPLACE(LOWER(BTRIM(item.kategori)), '[^a-z0-9]+', '-', 'g'), 80);

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_menu_items_category_fk'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT merchant_menu_items_category_fk
      FOREIGN KEY (category_id) REFERENCES merchant_menu_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_menu_items_status_check'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT merchant_menu_items_status_check
      CHECK (status IN ('draft', 'active', 'sold_out', 'scheduled', 'archived', 'moderation_pending', 'rejected'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_menu_items_moderation_status_check'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT merchant_menu_items_moderation_status_check
      CHECK (moderation_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS idx_merchant_menu_items_catalog_status
  ON merchant_menu_items (merchant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS merchant_menu_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(BTRIM(url)) BETWEEN 1 AND 2048),
  alt_text VARCHAR(200) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (menu_item_id, sort_order)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_menu_item_one_primary_image
  ON merchant_menu_item_images (menu_item_id)
  WHERE is_primary = TRUE;

INSERT INTO merchant_menu_item_images (menu_item_id, url, is_primary)
SELECT id, BTRIM(foto), TRUE
FROM merchant_menu_items
WHERE foto IS NOT NULL AND BTRIM(foto) <> ''
ON CONFLICT (menu_item_id, sort_order) DO NOTHING;

ALTER TABLE menu_item_variants
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'variant',
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_kind_check'
  ) THEN
    ALTER TABLE menu_item_variants
      ADD CONSTRAINT menu_item_variants_kind_check
      CHECK (kind IN ('variant', 'modifier'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_status_check'
  ) THEN
    ALTER TABLE menu_item_variants
      ADD CONSTRAINT menu_item_variants_status_check
      CHECK (status IN ('active', 'archived'));
  END IF;
END $$;
-- +goose StatementEnd

CREATE TABLE IF NOT EXISTS merchant_menu_item_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at <> ends_at),
  UNIQUE (menu_item_id, weekday, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS idx_merchant_menu_item_schedules_active
  ON merchant_menu_item_schedules (menu_item_id, weekday, is_active);

CREATE TABLE IF NOT EXISTS merchant_catalog_versions (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_catalog_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  entity_type VARCHAR(64) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  version BIGINT NOT NULL CHECK (version > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, version)
);

CREATE INDEX IF NOT EXISTS idx_merchant_catalog_events_feed
  ON merchant_catalog_events (merchant_id, version);

CREATE TABLE IF NOT EXISTS merchant_catalog_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(200) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'rejected', 'failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (merchant_id, idempotency_key)
);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_merchant_menu_item_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('active', 'scheduled') THEN
      NEW.is_available := TRUE;
    ELSE
      NEW.is_available := FALSE;
    END IF;
  ELSIF NEW.is_available IS DISTINCT FROM OLD.is_available THEN
    NEW.status := CASE WHEN NEW.is_available THEN 'active' ELSE 'sold_out' END;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_sync_merchant_menu_item_status ON merchant_menu_items;
CREATE TRIGGER trg_sync_merchant_menu_item_status
BEFORE INSERT OR UPDATE OF status, is_available ON merchant_menu_items
FOR EACH ROW EXECUTE FUNCTION sync_merchant_menu_item_status();

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION emit_merchant_catalog_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  merchant_id_value UUID;
  entity_id_value UUID;
  record_value JSONB;
  action_value VARCHAR(16);
  next_version BIGINT;
  entity_type_value VARCHAR(64) := TG_TABLE_NAME;
BEGIN
  entity_id_value := COALESCE(NEW.id, OLD.id);
  record_value := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  action_value := CASE TG_OP
    WHEN 'INSERT' THEN 'created'
    WHEN 'UPDATE' THEN 'updated'
    WHEN 'DELETE' THEN 'deleted'
  END;

  IF TG_TABLE_NAME = 'merchant_menu_items' OR TG_TABLE_NAME = 'merchant_menu_categories' THEN
    merchant_id_value := COALESCE(NEW.merchant_id, OLD.merchant_id);
  ELSIF TG_TABLE_NAME = 'menu_item_variants' THEN
    SELECT merchant_id INTO merchant_id_value
    FROM merchant_menu_items
    WHERE id = COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  ELSIF TG_TABLE_NAME = 'menu_item_variant_options' THEN
    SELECT item.merchant_id INTO merchant_id_value
    FROM menu_item_variants variant
    JOIN merchant_menu_items item ON item.id = variant.menu_item_id
    WHERE variant.id = COALESCE(NEW.variant_id, OLD.variant_id);
  ELSIF TG_TABLE_NAME = 'merchant_menu_item_images' OR TG_TABLE_NAME = 'merchant_menu_item_schedules' THEN
    SELECT merchant_id INTO merchant_id_value
    FROM merchant_menu_items
    WHERE id = COALESCE(NEW.menu_item_id, OLD.menu_item_id);
  END IF;

  IF merchant_id_value IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO merchant_catalog_versions (merchant_id, version, updated_at)
  VALUES (merchant_id_value, 1, NOW())
  ON CONFLICT (merchant_id) DO UPDATE
    SET version = merchant_catalog_versions.version + 1,
        updated_at = NOW()
  RETURNING version INTO next_version;

  INSERT INTO merchant_catalog_events (merchant_id, entity_type, entity_id, action, version, payload)
  VALUES (
    merchant_id_value,
    entity_type_value,
    entity_id_value,
    action_value,
    next_version,
    jsonb_build_object(
      'event_type', 'merchant.catalog.changed',
      'event_version', 1,
      'merchant_id', merchant_id_value,
      'entity_type', entity_type_value,
      'entity_id', entity_id_value,
      'action', action_value,
      'catalog_version', next_version,
      'record', record_value
    )
  );

  INSERT INTO event_outbox (aggregate_type, aggregate_id, event_type, event_version, payload, headers)
  VALUES (
    'merchant_catalog',
    merchant_id_value,
    'merchant.catalog.changed',
    1,
    jsonb_build_object(
      'merchant_id', merchant_id_value,
      'entity_type', entity_type_value,
      'entity_id', entity_id_value,
      'action', action_value,
      'catalog_version', next_version,
      'record', record_value
    ),
    jsonb_build_object('consumer', 'search-index', 'source_of_truth', 'merchant-service')
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_emit_merchant_menu_item_catalog_change ON merchant_menu_items;
CREATE TRIGGER trg_emit_merchant_menu_item_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON merchant_menu_items
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

DROP TRIGGER IF EXISTS trg_emit_merchant_menu_category_catalog_change ON merchant_menu_categories;
CREATE TRIGGER trg_emit_merchant_menu_category_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON merchant_menu_categories
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

DROP TRIGGER IF EXISTS trg_emit_menu_variant_catalog_change ON menu_item_variants;
CREATE TRIGGER trg_emit_menu_variant_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON menu_item_variants
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

DROP TRIGGER IF EXISTS trg_emit_menu_variant_option_catalog_change ON menu_item_variant_options;
CREATE TRIGGER trg_emit_menu_variant_option_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON menu_item_variant_options
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

DROP TRIGGER IF EXISTS trg_emit_menu_image_catalog_change ON merchant_menu_item_images;
CREATE TRIGGER trg_emit_menu_image_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON merchant_menu_item_images
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

DROP TRIGGER IF EXISTS trg_emit_menu_schedule_catalog_change ON merchant_menu_item_schedules;
CREATE TRIGGER trg_emit_menu_schedule_catalog_change
AFTER INSERT OR UPDATE OR DELETE ON merchant_menu_item_schedules
FOR EACH ROW EXECUTE FUNCTION emit_merchant_catalog_change();

-- +goose Down
DROP TRIGGER IF EXISTS trg_emit_menu_schedule_catalog_change ON merchant_menu_item_schedules;
DROP TRIGGER IF EXISTS trg_emit_menu_image_catalog_change ON merchant_menu_item_images;
DROP TRIGGER IF EXISTS trg_emit_menu_variant_option_catalog_change ON menu_item_variant_options;
DROP TRIGGER IF EXISTS trg_emit_menu_variant_catalog_change ON menu_item_variants;
DROP TRIGGER IF EXISTS trg_emit_merchant_menu_category_catalog_change ON merchant_menu_categories;
DROP TRIGGER IF EXISTS trg_emit_merchant_menu_item_catalog_change ON merchant_menu_items;
DROP FUNCTION IF EXISTS emit_merchant_catalog_change();
DROP TRIGGER IF EXISTS trg_sync_merchant_menu_item_status ON merchant_menu_items;
DROP FUNCTION IF EXISTS sync_merchant_menu_item_status();
DROP TABLE IF EXISTS merchant_catalog_imports;
DROP TABLE IF EXISTS merchant_catalog_events;
DROP TABLE IF EXISTS merchant_catalog_versions;
DROP TABLE IF EXISTS merchant_menu_item_schedules;
ALTER TABLE menu_item_variants
  DROP CONSTRAINT IF EXISTS menu_item_variants_status_check,
  DROP CONSTRAINT IF EXISTS menu_item_variants_kind_check,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS kind;
DROP TABLE IF EXISTS merchant_menu_item_images;
ALTER TABLE merchant_menu_items
  DROP CONSTRAINT IF EXISTS merchant_menu_items_moderation_status_check,
  DROP CONSTRAINT IF EXISTS merchant_menu_items_status_check,
  DROP CONSTRAINT IF EXISTS merchant_menu_items_category_fk,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS moderated_at,
  DROP COLUMN IF EXISTS moderated_by,
  DROP COLUMN IF EXISTS moderation_reason,
  DROP COLUMN IF EXISTS moderation_status,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS category_id;
DROP INDEX IF EXISTS idx_merchant_menu_items_catalog_status;
DROP INDEX IF EXISTS idx_merchant_menu_categories_merchant;
DROP TABLE IF EXISTS merchant_menu_categories;
