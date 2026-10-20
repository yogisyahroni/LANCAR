-- PROMO-2026-001: campaign media and server-generated redeem codes.
-- Promo campaigns remain the canonical source for customer web and mobile.

-- +goose Up

ALTER TABLE promo_campaigns
  ADD COLUMN IF NOT EXISTS promo_image_url TEXT,
  ADD COLUMN IF NOT EXISTS promo_image_alt VARCHAR(240) NOT NULL DEFAULT '';

-- Keep the public media contract constrained to same-origin public uploads or
-- HTTPS resources. The application validates this again before persistence.
ALTER TABLE promo_campaigns
  DROP CONSTRAINT IF EXISTS promo_campaigns_image_url_check,
  ADD CONSTRAINT promo_campaigns_image_url_check CHECK (
    promo_image_url IS NULL
    OR promo_image_url = ''
    OR promo_image_url ~ '^/uploads/banners/[A-Za-z0-9._/-]+$'
    OR promo_image_url ~ '^https://[^[:space:]]+$'
  );

-- +goose Down

ALTER TABLE promo_campaigns
  DROP CONSTRAINT IF EXISTS promo_campaigns_image_url_check;

ALTER TABLE promo_campaigns
  DROP COLUMN IF EXISTS promo_image_alt,
  DROP COLUMN IF EXISTS promo_image_url;
