-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-063: user_device_tokens
-- Prasyarat push notification (FCM) — merchant wajib tahu order
-- masuk dalam 3 menit (FOOD-BIKE-022), driver dapat offer,
-- customer dapat status update.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'android'
    CHECK (platform IN ('android', 'ios', 'web')),
  app_name VARCHAR(30) NOT NULL DEFAULT 'tembus-courier'
    CHECK (app_name IN ('tembus-courier', 'tembus-customer', 'tembus-merchant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user
  ON user_device_tokens(user_id);

-- +goose Down
DROP TABLE IF EXISTS user_device_tokens;
