CREATE TABLE IF NOT EXISTS payment_links (
    id VARCHAR(50) PRIMARY KEY,
    merchant_id UUID NOT NULL REFERENCES users(id),
    item_name VARCHAR(255) NOT NULL,
    item_price BIGINT NOT NULL,
    item_image_url VARCHAR(255) NOT NULL,
    merchant_fee_amount BIGINT NOT NULL DEFAULT 0,
    dropoff_address TEXT NOT NULL,
    dropoff_lat DOUBLE PRECISION NOT NULL,
    dropoff_lng DOUBLE PRECISION NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
