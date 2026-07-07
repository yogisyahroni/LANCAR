-- Migration for Product Catalogs

CREATE TABLE IF NOT EXISTS product_catalogs (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    weight_kg DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    item_image TEXT,
    price DECIMAL(15,2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_catalogs_customer_id ON product_catalogs(customer_id);

INSERT INTO system_configs (key, value, description, updated_at) 
VALUES ('product_catalog_max_items', '1000', 'Maximum number of items a UMKM can have in their product catalog', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP;
