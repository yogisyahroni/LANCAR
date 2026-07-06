-- Migration: Add awb_sender_name to users for 3PL logistics
-- Date: 2026-07-06

BEGIN;

ALTER TABLE users
ADD COLUMN awb_sender_name VARCHAR(50),
ADD COLUMN awb_sender_code VARCHAR(50);

-- Make it UNIQUE so no two users have the same sender name
ALTER TABLE users
ADD CONSTRAINT unique_awb_sender_name UNIQUE (awb_sender_name);

COMMIT;
