-- +goose Up
-- MERCH-2026-008: auditable merchant enforcement overlay.
-- The overlay blocks new discovery/checkout capability while preserving the
-- existing order state machine for active food orders. Merchant onboarding,
-- branch activity and catalog status remain their own canonical facts.

-- Catalog items are branch-owned. Existing merchants already receive a MAIN
-- branch from MERCH-2026-002, so this is a safe backfill for legacy rows.
ALTER TABLE merchant_menu_items
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE merchant_menu_items item
SET branch_id = branch.id
FROM merchant_branches branch
WHERE item.branch_id IS NULL
  AND branch.merchant_id = item.merchant_id
  AND branch.code = 'MAIN';

-- +goose StatementBegin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_menu_items_branch_fk'
  ) THEN
    ALTER TABLE merchant_menu_items
      ADD CONSTRAINT merchant_menu_items_branch_fk
      FOREIGN KEY (branch_id) REFERENCES merchant_branches(id) ON DELETE RESTRICT;
  END IF;
END $$;
-- +goose StatementEnd

ALTER TABLE merchant_menu_items
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_menu_items_branch_status
  ON merchant_menu_items (branch_id, status, updated_at DESC);

-- New catalog items without an explicit branch stay on the merchant's MAIN
-- branch. Staff branch context is still enforced by the existing access layer.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION assign_merchant_menu_item_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    SELECT b.id INTO NEW.branch_id
    FROM merchant_branches b
    WHERE b.merchant_id = NEW.merchant_id
    ORDER BY CASE WHEN b.code = 'MAIN' THEN 0 ELSE 1 END, b.created_at ASC
    LIMIT 1;
  END IF;
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'merchant branch belum tersedia';
  END IF;
  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_assign_merchant_menu_item_branch ON merchant_menu_items;
CREATE TRIGGER trg_assign_merchant_menu_item_branch
  BEFORE INSERT ON merchant_menu_items
  FOR EACH ROW EXECUTE FUNCTION assign_merchant_menu_item_branch();

CREATE TABLE IF NOT EXISTS merchant_enforcement_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  scope               VARCHAR(16) NOT NULL
                      CHECK (scope IN ('merchant', 'branch', 'item', 'ads')),
  target_branch_id    UUID REFERENCES merchant_branches(id) ON DELETE RESTRICT,
  target_menu_item_id UUID REFERENCES merchant_menu_items(id) ON DELETE RESTRICT,
  capability          VARCHAR(32),
  reason_category     VARCHAR(40) NOT NULL
                      CHECK (reason_category IN ('safety', 'fraud_integrity', 'document_compliance', 'quality', 'marketplace_policy', 'other')),
  reason_detail       TEXT NOT NULL
                      CHECK (char_length(BTRIM(reason_detail)) BETWEEN 10 AND 2000),
  evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
  merchant_message    TEXT
                      CHECK (merchant_message IS NULL OR char_length(BTRIM(merchant_message)) BETWEEN 1 AND 500),
  remediation_message TEXT
                      CHECK (remediation_message IS NULL OR char_length(BTRIM(remediation_message)) BETWEEN 1 AND 500),
  disclosure_level    VARCHAR(24) NOT NULL DEFAULT 'actionable'
                      CHECK (disclosure_level IN ('actionable', 'security_restricted')),
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_until    TIMESTAMPTZ,
  safe_order_policy  VARCHAR(40) NOT NULL DEFAULT 'allow_active_order_completion'
                      CHECK (safe_order_policy IN ('allow_active_order_completion', 'immediate_safety_stop')),
  status             VARCHAR(30) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('scheduled', 'pending_safe_completion', 'active', 'revoked', 'expired')),
  created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revoked_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (
    (scope = 'merchant' AND target_branch_id IS NULL AND target_menu_item_id IS NULL AND capability IS NULL)
    OR (scope = 'branch' AND target_branch_id IS NOT NULL AND target_menu_item_id IS NULL AND capability IS NULL)
    OR (scope = 'item' AND target_branch_id IS NULL AND target_menu_item_id IS NOT NULL AND capability IS NULL)
    OR (scope = 'ads' AND target_branch_id IS NULL AND target_menu_item_id IS NULL AND LOWER(capability) = 'ads')
  )
);

CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_active_lookup
  ON merchant_enforcement_actions (merchant_id, scope, status, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_branch_lookup
  ON merchant_enforcement_actions (target_branch_id, status, effective_from)
  WHERE scope = 'branch';
CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_item_lookup
  ON merchant_enforcement_actions (target_menu_item_id, status, effective_from)
  WHERE scope = 'item';
CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_ads_lookup
  ON merchant_enforcement_actions (merchant_id, capability, status, effective_from)
  WHERE scope = 'ads';

CREATE TABLE IF NOT EXISTS merchant_enforcement_action_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enforcement_action_id UUID NOT NULL REFERENCES merchant_enforcement_actions(id) ON DELETE CASCADE,
  event_type           VARCHAR(40) NOT NULL
                       CHECK (event_type IN ('created', 'safe_completion_pending', 'activated', 'revoked', 'expired', 'appeal_submitted', 'appeal_reviewed')),
  actor_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_events_action
  ON merchant_enforcement_action_events (enforcement_action_id, created_at ASC);

CREATE TABLE IF NOT EXISTS merchant_enforcement_appeals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enforcement_action_id UUID NOT NULL REFERENCES merchant_enforcement_actions(id) ON DELETE CASCADE,
  merchant_id          UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reason               TEXT NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 10 AND 2000),
  status               VARCHAR(20) NOT NULL DEFAULT 'submitted'
                       CHECK (status IN ('submitted', 'in_review', 'approved', 'rejected')),
  review_note          TEXT,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at          TIMESTAMPTZ,
  reviewed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_appeals_merchant
  ON merchant_enforcement_appeals (merchant_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_enforcement_appeals_review_queue
  ON merchant_enforcement_appeals (status, submitted_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_enforcement_appeals_open
  ON merchant_enforcement_appeals (enforcement_action_id)
  WHERE status IN ('submitted', 'in_review');

-- Active food orders remain owned by order-service. This helper only answers
-- whether an action applies to a new checkout/discovery target.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_enforcement_is_active(
  merchant_id_value UUID,
  branch_id_value UUID DEFAULT NULL,
  menu_item_id_value UUID DEFAULT NULL,
  capability_value TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM merchant_enforcement_actions action
    WHERE action.merchant_id = merchant_id_value
      AND action.status IN ('scheduled', 'pending_safe_completion', 'active')
      AND action.effective_from <= NOW()
      AND (action.effective_until IS NULL OR action.effective_until > NOW())
      AND (
        action.scope = 'merchant'
        OR (action.scope = 'branch' AND action.target_branch_id = branch_id_value)
        OR (action.scope = 'item' AND action.target_menu_item_id = menu_item_id_value)
        OR (action.scope = 'ads' AND LOWER(action.capability) = LOWER(NULLIF(capability_value, '')))
      )
  );
$$;
-- +goose StatementEnd

-- Orders in any non-terminal fulfillment state are preserved. A scheduled or
-- pending action blocks new orders, and becomes active immediately when there
-- is no remaining order to complete safely. No direct financial mutation or
-- client-side cancellation is performed by this policy function.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION merchant_enforcement_order_matches(action_row merchant_enforcement_actions, order_id_value UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orders order_row
    WHERE order_row.id = order_id_value
      AND order_row.service_sub_type = 'food_delivery'
      AND order_row.status IN (
        'pending_merchant', 'preparing', 'ready_for_pickup', 'searching',
        'pending_assignment', 'assigned', 'accepted', 'pickup_arrived',
        'picking_up', 'picked_up', 'inbound_origin', 'outbound_origin',
        'inbound_destination', 'outbound_destination', 'delivering',
        'return_to_sender'
      )
      AND (
        (action_row.scope = 'merchant' AND order_row.merchant_id = action_row.merchant_id)
        OR (action_row.scope = 'branch' AND EXISTS (
          SELECT 1
          FROM food_order_items order_item
          JOIN merchant_menu_items menu_item ON menu_item.id = order_item.menu_item_id
          WHERE order_item.order_id = order_row.id
            AND menu_item.branch_id = action_row.target_branch_id
        ))
        OR (action_row.scope = 'item' AND EXISTS (
          SELECT 1
          FROM food_order_items order_item
          WHERE order_item.order_id = order_row.id
            AND order_item.menu_item_id = action_row.target_menu_item_id
        ))
      )
  );
$$;
-- +goose StatementEnd

-- Called by APIs before reads and by the deployment worker when present. This
-- makes safe completion converge even if no merchant requests the status page.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION refresh_merchant_enforcement_actions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  action_row merchant_enforcement_actions;
  active_orders INTEGER;
  next_status TEXT;
  changed INTEGER := 0;
BEGIN
  FOR action_row IN
    SELECT *
    FROM merchant_enforcement_actions action
    WHERE (
      action.status = 'scheduled'
      AND action.effective_from <= NOW()
      AND (action.effective_until IS NULL OR action.effective_until > NOW())
    ) OR action.status = 'pending_safe_completion'
    FOR UPDATE
  LOOP
    SELECT COUNT(*)::INTEGER
      INTO active_orders
    FROM orders order_row
    WHERE merchant_enforcement_order_matches(action_row, order_row.id);

    IF action_row.status = 'scheduled' THEN
      next_status := CASE
        WHEN active_orders > 0
         AND action_row.safe_order_policy <> 'immediate_safety_stop'
          THEN 'pending_safe_completion'
        ELSE 'active'
      END;
    ELSE
      next_status := CASE WHEN active_orders = 0 THEN 'active' ELSE 'pending_safe_completion' END;
    END IF;

    IF action_row.status IS DISTINCT FROM next_status THEN
      UPDATE merchant_enforcement_actions
      SET status = next_status, updated_at = NOW()
      WHERE id = action_row.id;

      INSERT INTO merchant_enforcement_action_events (enforcement_action_id, event_type, actor_id, metadata)
      VALUES (
        action_row.id,
        CASE WHEN next_status = 'pending_safe_completion' THEN 'safe_completion_pending' ELSE 'activated' END,
        action_row.created_by,
        jsonb_build_object('active_order_count', active_orders, 'source', 'refresh_merchant_enforcement_actions')
      );
      changed := changed + 1;
    END IF;
  END LOOP;
  RETURN changed;
END;
$$;
-- +goose StatementEnd

-- +goose Down
DROP FUNCTION IF EXISTS refresh_merchant_enforcement_actions();
DROP FUNCTION IF EXISTS merchant_enforcement_order_matches(merchant_enforcement_actions, UUID);
DROP FUNCTION IF EXISTS merchant_enforcement_is_active(UUID, UUID, UUID, TEXT);
DROP INDEX IF EXISTS uq_merchant_enforcement_appeals_open;
DROP INDEX IF EXISTS idx_merchant_enforcement_appeals_review_queue;
DROP INDEX IF EXISTS idx_merchant_enforcement_appeals_merchant;
DROP TABLE IF EXISTS merchant_enforcement_appeals;
DROP INDEX IF EXISTS idx_merchant_enforcement_events_action;
DROP TABLE IF EXISTS merchant_enforcement_action_events;
DROP INDEX IF EXISTS idx_merchant_enforcement_ads_lookup;
DROP INDEX IF EXISTS idx_merchant_enforcement_item_lookup;
DROP INDEX IF EXISTS idx_merchant_enforcement_branch_lookup;
DROP INDEX IF EXISTS idx_merchant_enforcement_active_lookup;
DROP TABLE IF EXISTS merchant_enforcement_actions;
DROP TRIGGER IF EXISTS trg_assign_merchant_menu_item_branch ON merchant_menu_items;
DROP FUNCTION IF EXISTS assign_merchant_menu_item_branch();
DROP INDEX IF EXISTS idx_merchant_menu_items_branch_status;
ALTER TABLE merchant_menu_items
  DROP CONSTRAINT IF EXISTS merchant_menu_items_branch_fk,
  DROP COLUMN IF EXISTS branch_id;
