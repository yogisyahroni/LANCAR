-- C3: Customer Favorite Merchants
-- Create table for customer to bookmark favorite food merchants

CREATE TABLE IF NOT EXISTS customer_favorite_merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorite_merchants_customer ON customer_favorite_merchants(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_favorite_merchants_merchant ON customer_favorite_merchants(merchant_id);

-- Comment
COMMENT ON TABLE customer_favorite_merchants IS 'Customer bookmarked favorite food merchants for quick reorder/browse';
COMMENT ON COLUMN customer_favorite_merchants.customer_id IS 'FK to users (role=customer)';
COMMENT ON COLUMN customer_favorite_merchants.merchant_id IS 'FK to merchants';
COMMENT ON COLUMN customer_favorite_merchants.created_at IS 'When customer added to favorites';