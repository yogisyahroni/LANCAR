-- LANCAR EXPAND AUTH IDENTIFIER LIMITS
-- Date: 2026-05-12
-- +goose Up
ALTER TABLE public.customers ALTER COLUMN phone_number TYPE VARCHAR(255);
ALTER TABLE public.staff ALTER COLUMN phone_number TYPE VARCHAR(255);
ALTER TABLE public.couriers ALTER COLUMN phone_number TYPE VARCHAR(255);
ALTER TABLE public.otp_logs ALTER COLUMN phone_number TYPE VARCHAR(255);

-- +goose Down
ALTER TABLE public.customers ALTER COLUMN phone_number TYPE VARCHAR(20);
ALTER TABLE public.staff ALTER COLUMN phone_number TYPE VARCHAR(20);
ALTER TABLE public.couriers ALTER COLUMN phone_number TYPE VARCHAR(20);
ALTER TABLE public.otp_logs ALTER COLUMN phone_number TYPE VARCHAR(20);
