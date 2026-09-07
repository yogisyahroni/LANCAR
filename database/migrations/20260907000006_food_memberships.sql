-- FOOD-2026-021: entitlement and free-delivery subsidy accounting.
CREATE TABLE IF NOT EXISTS food_membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(80) NOT NULL,
    monthly_fee_idr BIGINT NOT NULL CHECK (monthly_fee_idr >= 0),
    free_delivery_cap_idr BIGINT NOT NULL CHECK (free_delivery_cap_idr >= 0),
    minimum_subtotal_idr BIGINT NOT NULL DEFAULT 0 CHECK (minimum_subtotal_idr >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO food_membership_plans (name, monthly_fee_idr, free_delivery_cap_idr, minimum_subtotal_idr)
SELECT 'Food Member', 49000, 100000, 50000
WHERE NOT EXISTS (SELECT 1 FROM food_membership_plans);

CREATE TABLE IF NOT EXISTS food_membership_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES food_membership_plans(id),
    status VARCHAR(24) NOT NULL CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    free_delivery_used_idr BIGINT NOT NULL DEFAULT 0 CHECK (free_delivery_used_idr >= 0),
    subscription_idempotency_key VARCHAR(120) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (current_period_end >= current_period_start)
);
CREATE INDEX IF NOT EXISTS idx_food_membership_active ON food_membership_entitlements(user_id, status, current_period_end);

CREATE TABLE IF NOT EXISTS food_membership_subsidy_ledger (
    entitlement_id UUID NOT NULL REFERENCES food_membership_entitlements(id),
    order_id UUID NOT NULL UNIQUE,
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entitlement_id, order_id)
);

-- Down
-- DROP TABLE IF EXISTS food_membership_subsidy_ledger;
-- DROP TABLE IF EXISTS food_membership_entitlements;
-- DROP TABLE IF EXISTS food_membership_plans;
