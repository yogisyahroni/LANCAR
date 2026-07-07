-- Menambahkan kolom receiver_name, receiver_phone, dan routing_code ke tabel orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS routing_code VARCHAR(100);
