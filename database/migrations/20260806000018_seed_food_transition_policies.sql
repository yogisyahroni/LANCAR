-- +goose Up
-- ============================================================
-- LANCAR — FOOD-BIKE-038: status_transition_policies untuk food_delivery
-- Pickup dari merchant (picked_up) & delivery ke customer (delivered)
-- WAJIB requires_proof=TRUE — order food tidak bisa lanjut tanpa
-- bukti scan+foto di kedua titik.
-- ============================================================
INSERT INTO status_transition_policies (
  workflow_role,
  from_status,
  to_status,
  label,
  description,
  requires_proof,
  requires_admin,
  display_order
) VALUES
  ('food_delivery', 'pending_merchant', 'preparing', 'Merchant mulai memasak', 'Merchant menerima dan mulai menyiapkan pesanan.', FALSE, FALSE, 10),
  ('food_delivery', 'preparing', 'searching', 'Cari kurir sepeda', 'Order siap, sistem mencari kurir sepeda terdekat.', FALSE, FALSE, 20),
  ('food_delivery', 'searching', 'accepted', 'Kurir terassign', 'Kurir sepeda menerima assignment.', FALSE, FALSE, 30),
  ('food_delivery', 'accepted', 'picking_up', 'Kurir menuju merchant', 'Kurir berangkat ke merchant untuk pickup.', FALSE, FALSE, 40),
  ('food_delivery', 'picking_up', 'picked_up', 'Pickup dari merchant selesai', 'Pickup makanan WAJIB bukti scan + foto di merchant.', TRUE, FALSE, 50),
  ('food_delivery', 'picked_up', 'delivering', 'Mengantar ke customer', 'Kurir mengantar makanan ke customer.', FALSE, FALSE, 60),
  ('food_delivery', 'delivering', 'delivered', 'Pengiriman selesai', 'Delivery makanan WAJIB bukti POD ke customer.', TRUE, FALSE, 70)
ON CONFLICT (workflow_role, from_status, to_status) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  requires_proof = EXCLUDED.requires_proof,
  requires_admin = EXCLUDED.requires_admin,
  is_active = TRUE,
  display_order = EXCLUDED.display_order,
  version = status_transition_policies.version + 1,
  updated_at = NOW();

-- +goose Down
DELETE FROM status_transition_policies WHERE workflow_role = 'food_delivery';
