-- UIUX-2026-008: provide the customer Home hero with a real, editable
-- campaign record. The Android client must never carry the Figma sample offer
-- as a fallback; campaign copy and economics belong to promo_campaigns and
-- can be changed or retired from the admin promo center.

-- +goose Up

INSERT INTO promo_campaigns (
  code,
  name,
  description,
  status,
  discount_type,
  discount_value_idr,
  max_discount_idr,
  min_order_idr,
  service_codes,
  component_scope,
  stacking_key,
  allow_stack_different_service,
  total_budget_idr,
  daily_budget_idr,
  max_redemptions,
  per_user_limit,
  starts_at,
  ends_at,
  notification_copy,
  moderation_status,
  approved_at,
  published_at
)
VALUES (
  'TEMBUS-HOME-RAMADAN-2026',
  'Kirim Cepat Se-Jabodetabek',
  'Garansi sampai dalam 2 jam atau ongkir kembali utuh!',
  'active',
  'shipping_discount',
  8000,
  8000,
  0,
  ARRAY['tembus_instant', 'tembus_same_day']::TEXT[],
  'shipping',
  'shipping',
  TRUE,
  8000000,
  800000,
  1000,
  1,
  NOW(),
  NOW() + INTERVAL '90 days',
  jsonb_build_object(
    'badge', 'SPESIAL RAMADAN',
    'cta_label', 'Klaim Promo'
  ),
  'approved',
  NOW(),
  NOW()
)
ON CONFLICT (code) DO NOTHING;

-- +goose Down

DELETE FROM promo_campaigns
WHERE code = 'TEMBUS-HOME-RAMADAN-2026';
