-- FOOD-2026-024: multi-store orchestration without merging child order invariants.
CREATE TABLE IF NOT EXISTS food_multi_store_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalized', 'settled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS food_multi_store_bundle_merchants (
    bundle_id UUID NOT NULL REFERENCES food_multi_store_bundles(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4),
    order_id UUID UNIQUE REFERENCES orders(id),
    PRIMARY KEY (bundle_id, merchant_id),
    UNIQUE (bundle_id, position)
);
CREATE TABLE IF NOT EXISTS food_multi_store_bundle_settlements (
    bundle_id UUID PRIMARY KEY REFERENCES food_multi_store_bundles(id) ON DELETE CASCADE,
    gross_total_idr BIGINT NOT NULL CHECK (gross_total_idr >= 0),
    child_order_count INTEGER NOT NULL CHECK (child_order_count BETWEEN 2 AND 5),
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'reconciled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down
-- DROP TABLE IF EXISTS food_multi_store_bundle_settlements;
-- DROP TABLE IF EXISTS food_multi_store_bundle_merchants;
-- DROP TABLE IF EXISTS food_multi_store_bundles;
