-- +goose Up
-- Merchant replies to customer ratings. One latest response per rating;
-- subsequent submits update the same persisted reply instead of creating mock UI state.
CREATE TABLE IF NOT EXISTS merchant_rating_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_rating_id UUID NOT NULL UNIQUE REFERENCES merchant_ratings(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_rating_replies_merchant
  ON merchant_rating_replies(merchant_id, updated_at DESC);

-- +goose Down
DROP TABLE IF EXISTS merchant_rating_replies;
