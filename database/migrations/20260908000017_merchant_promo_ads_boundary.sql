-- MERCH-2026-007: keep merchant-funded price offers and paid visibility in
-- the existing campaign registry, while making their financial and ranking
-- semantics explicit.

-- +goose Up

ALTER TABLE promo_campaigns
  ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) NOT NULL DEFAULT 'promo',
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS creative_headline VARCHAR(120),
  ADD COLUMN IF NOT EXISTS creative_body VARCHAR(240),
  ADD COLUMN IF NOT EXISTS creative_image_url TEXT;

-- Existing food-discovery sponsored rows were visibility placements, not
-- checkout promotions. Backfill them before adding the boundary constraint.
UPDATE promo_campaigns
SET product_type = 'ads',
    merchant_id = CASE
      WHEN audience_rules->>'merchant_id' ~* '^[0-9a-f-]{36}$'
        THEN (audience_rules->>'merchant_id')::uuid
      ELSE NULL
    END,
    discount_value_idr = 0,
    discount_percent = 0,
    max_discount_idr = 0,
    min_order_idr = 0
WHERE product_type = 'promo'
  AND audience_rules->>'placement' = 'food_discovery';

ALTER TABLE promo_campaigns
  DROP CONSTRAINT IF EXISTS promo_campaigns_product_type_check,
  ADD CONSTRAINT promo_campaigns_product_type_check
    CHECK (product_type IN ('promo', 'ads')),
  DROP CONSTRAINT IF EXISTS promo_campaigns_product_boundary_check,
  ADD CONSTRAINT promo_campaigns_product_boundary_check
    CHECK (
      (product_type = 'promo' AND merchant_id IS NULL)
      OR (
        product_type = 'ads'
        AND discount_value_idr = 0
        AND discount_percent = 0
        AND max_discount_idr = 0
        AND min_order_idr = 0
        AND NOT (
          COALESCE(creative_headline, '') || ' ' || COALESCE(creative_body, '')
            ~* '(diskon|discount|eta|rating|bintang|stars?)'
          OR COALESCE(creative_headline, '') || ' ' || COALESCE(creative_body, '')
            ~ '[0-9]+[[:space:]]*%'
        )
      )
    );

CREATE INDEX IF NOT EXISTS idx_promo_campaigns_product_merchant
  ON promo_campaigns(product_type, merchant_id, status, starts_at, ends_at);

-- Required by the composite owner FK on the purchase record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_campaigns_id_merchant
  ON promo_campaigns(id, merchant_id);

-- A purchase is the merchant's durable charge/idempotency boundary. The
-- campaign remains the canonical visibility object; this table is not a
-- second campaign store.
CREATE TABLE IF NOT EXISTS merchant_ad_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL UNIQUE REFERENCES promo_campaigns(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(160) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'charged',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_ad_purchases_status_check
    CHECK (status IN ('charged', 'refunded', 'void')),
  CONSTRAINT merchant_ad_purchases_campaign_owner_fk
    FOREIGN KEY (campaign_id, merchant_id)
    REFERENCES promo_campaigns(id, merchant_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ad_purchase_idempotency
  ON merchant_ad_purchases(merchant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_merchant_ad_purchases_merchant_time
  ON merchant_ad_purchases(merchant_id, created_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_merchant_ad_purchases_merchant_time;
DROP INDEX IF EXISTS uq_merchant_ad_purchase_idempotency;
DROP TABLE IF EXISTS merchant_ad_purchases;
DROP INDEX IF EXISTS idx_promo_campaigns_product_merchant;
ALTER TABLE promo_campaigns
  DROP CONSTRAINT IF EXISTS promo_campaigns_product_boundary_check,
  DROP CONSTRAINT IF EXISTS promo_campaigns_product_type_check;
DROP INDEX IF EXISTS uq_promo_campaigns_id_merchant;
ALTER TABLE promo_campaigns
  DROP COLUMN IF EXISTS creative_image_url,
  DROP COLUMN IF EXISTS creative_body,
  DROP COLUMN IF EXISTS creative_headline,
  DROP COLUMN IF EXISTS merchant_id,
  DROP COLUMN IF EXISTS product_type;
