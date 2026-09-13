-- SAFE-2026-003: explicit, auditable order controls for a reviewed safety
-- incident. The order lifecycle remains the source of truth; this additive
-- control state prevents unsafe courier progress without inventing a second
-- order status machine.

-- +goose Up

ALTER TABLE order_legs
  ADD COLUMN IF NOT EXISTS safety_control_state VARCHAR(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS safety_control_reason TEXT,
  ADD COLUMN IF NOT EXISTS safety_control_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_control_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE order_legs
  DROP CONSTRAINT IF EXISTS order_legs_safety_control_state_check,
  ADD CONSTRAINT order_legs_safety_control_state_check
    CHECK (safety_control_state IN ('NONE', 'PAUSED', 'HELD', 'REASSIGN_REQUESTED'));

CREATE INDEX IF NOT EXISTS idx_order_legs_safety_control
  ON order_legs (safety_control_state, updated_at DESC)
  WHERE safety_control_state <> 'NONE';

COMMENT ON COLUMN order_legs.safety_control_state IS
  'Reviewed safety control overlay; authoritative delivery status remains status.';

-- +goose Down
DROP INDEX IF EXISTS idx_order_legs_safety_control;
ALTER TABLE order_legs
  DROP CONSTRAINT IF EXISTS order_legs_safety_control_state_check,
  DROP COLUMN IF EXISTS safety_control_by,
  DROP COLUMN IF EXISTS safety_control_at,
  DROP COLUMN IF EXISTS safety_control_reason,
  DROP COLUMN IF EXISTS safety_control_state;
