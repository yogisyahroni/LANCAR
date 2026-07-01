-- Migration: add_courier_rating_to_orders
-- Description: Menambahkan kolom rating ke tabel orders untuk fitur Customer Rating

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS courier_rating DECIMAL(3,2) NULL,
ADD COLUMN IF NOT EXISTS rating_comment TEXT NULL,
ADD COLUMN IF NOT EXISTS rating_reminder_count INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_rating_reminder_at TIMESTAMP WITH TIME ZONE NULL;

-- Memastikan courier_profiles juga punya tabel yang benar untuk score 
-- Sebelumnya ada avg_rating dan rating_count?
ALTER TABLE courier_profiles
ADD COLUMN IF NOT EXISTS avg_rating DECIMAL(3,2) NOT NULL DEFAULT 5.00,
ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0;
