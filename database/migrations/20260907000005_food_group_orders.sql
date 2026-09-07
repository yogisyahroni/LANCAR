-- +goose Up
-- FOOD-2026-020: server-authoritative shared cart and optional split allocation.
-- Payment remains owned by payment-service; this table only records the
-- immutable allocation requested for each participant.
CREATE TABLE IF NOT EXISTS food_group_orders (
    id UUID PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    creator_user_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    deadline TIMESTAMPTZ NOT NULL,
    split_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CHECK (deadline > created_at)
);
CREATE INDEX IF NOT EXISTS idx_food_group_orders_deadline ON food_group_orders(status, deadline);

CREATE TABLE IF NOT EXISTS food_group_members (
    group_id UUID NOT NULL REFERENCES food_group_orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('creator', 'member')),
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS food_group_cart_items (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES food_group_orders(id) ON DELETE CASCADE,
    member_user_id UUID NOT NULL,
    menu_item_id UUID NOT NULL REFERENCES merchant_menu_items(id),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
    notes VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_group_cart_group ON food_group_cart_items(group_id, created_at);

CREATE TABLE IF NOT EXISTS food_group_split_allocations (
    group_id UUID NOT NULL REFERENCES food_group_orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    amount_idr BIGINT NOT NULL CHECK (amount_idr >= 0),
    payment_state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (payment_state IN ('pending', 'paid', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS group_order_id UUID REFERENCES food_group_orders(id);
CREATE INDEX IF NOT EXISTS idx_orders_group_order ON orders(group_order_id) WHERE group_order_id IS NOT NULL;

-- Down
-- ALTER TABLE orders DROP COLUMN IF EXISTS group_order_id;
-- DROP TABLE IF EXISTS food_group_split_allocations;
-- DROP TABLE IF EXISTS food_group_cart_items;
-- DROP TABLE IF EXISTS food_group_members;
-- DROP TABLE IF EXISTS food_group_orders;
