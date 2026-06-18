-- Add Store Name and Default Pickup Address to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_pickup_address TEXT;
