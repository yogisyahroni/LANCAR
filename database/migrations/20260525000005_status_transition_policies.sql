-- +goose Up
CREATE TABLE IF NOT EXISTS status_transition_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_role VARCHAR(40) NOT NULL,
  from_status VARCHAR(40) NOT NULL,
  to_status VARCHAR(40) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description TEXT,
  requires_proof BOOLEAN NOT NULL DEFAULT FALSE,
  requires_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 100,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_role, from_status, to_status)
);

CREATE INDEX IF NOT EXISTS idx_status_transition_policies_lookup
  ON status_transition_policies(workflow_role, from_status, is_active, display_order);

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
  ('on_demand', 'pending', 'assigned', 'Terima assignment', 'Order on-demand masuk ke assignment kurir.', FALSE, FALSE, 10),
  ('on_demand', 'assigned', 'accepted', 'Mulai menuju pickup', 'Kurir menerima assignment dan menuju pickup.', FALSE, FALSE, 20),
  ('on_demand', 'accepted', 'in_transit', 'Pickup selesai', 'Pickup on-demand wajib diselesaikan lewat scan dan foto pickup.', TRUE, FALSE, 30),
  ('on_demand', 'in_transit', 'delivered', 'Pengiriman selesai', 'Delivery on-demand wajib diselesaikan lewat bukti POD.', TRUE, FALSE, 40),
  ('on_demand', 'accepted', 'failed', 'Laporkan gagal pickup', 'Pickup gagal sebelum barang diterima.', FALSE, FALSE, 90),
  ('on_demand', 'in_transit', 'failed', 'Laporkan gagal antar', 'Pengiriman gagal setelah pickup.', FALSE, FALSE, 100),
  ('pickup', 'pending', 'assigned', 'Assignment pickup', 'Leg pickup ditugaskan ke kurir.', FALSE, FALSE, 10),
  ('pickup', 'assigned', 'picked_up', 'Pickup selesai', 'Barang berhasil diambil untuk proses berikutnya.', FALSE, FALSE, 20),
  ('pickup', 'picked_up', 'delivered', 'Serah ke hub', 'Pickup selesai dan diserahkan ke titik operasional.', FALSE, FALSE, 30),
  ('pickup', 'assigned', 'failed', 'Laporkan gagal pickup', 'Pickup gagal dilakukan.', FALSE, FALSE, 90),
  ('delivery', 'pending', 'assigned', 'Assignment delivery', 'Leg delivery ditugaskan ke kurir.', FALSE, FALSE, 10),
  ('delivery', 'assigned', 'in_transit', 'Mulai pengantaran', 'Kurir mulai pengantaran ke penerima.', FALSE, FALSE, 20),
  ('delivery', 'in_transit', 'delivered', 'Pengiriman selesai', 'Delivery wajib diselesaikan lewat bukti POD jika policy proof aktif.', TRUE, FALSE, 30),
  ('delivery', 'assigned', 'failed', 'Laporkan gagal antar', 'Delivery gagal sebelum berangkat.', FALSE, FALSE, 90),
  ('delivery', 'in_transit', 'failed', 'Laporkan gagal antar', 'Delivery gagal saat perjalanan.', FALSE, FALSE, 100),
  ('network', 'pending', 'assigned', 'Assignment', 'Order jaringan ditugaskan ke kurir.', FALSE, FALSE, 10),
  ('network', 'assigned', 'picked_up', 'Pickup selesai', 'Barang berhasil diambil.', FALSE, FALSE, 20),
  ('network', 'picked_up', 'in_transit', 'Mulai pengantaran', 'Barang mulai diantar.', FALSE, FALSE, 30),
  ('network', 'in_transit', 'delivered', 'Pengiriman selesai', 'Pengiriman selesai dengan bukti operasional.', TRUE, FALSE, 40),
  ('network', 'assigned', 'failed', 'Laporkan gagal', 'Order gagal pada tahap assignment.', FALSE, FALSE, 90),
  ('network', 'in_transit', 'failed', 'Laporkan gagal', 'Order gagal saat perjalanan.', FALSE, FALSE, 100)
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
DROP INDEX IF EXISTS idx_status_transition_policies_lookup;
DROP TABLE IF EXISTS status_transition_policies;
