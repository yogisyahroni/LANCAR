-- P0: Move courier pickup cancellation reasons out of mobile/backend source code.
-- These rows are operational configuration and can be managed through admin tooling later.

-- +goose Up
CREATE TABLE IF NOT EXISTS courier_pickup_cancellation_reasons (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_pickup_cancellation_reasons_active_order
  ON courier_pickup_cancellation_reasons (is_active, display_order, code);

INSERT INTO courier_pickup_cancellation_reasons (code, title, description, is_active, display_order)
VALUES
  ('item_mismatch', 'Barang tidak sesuai', 'Jenis, jumlah, dimensi, atau berat berbeda dari data order.', TRUE, 10),
  ('item_damaged', 'Barang rusak', 'Kondisi barang tidak layak untuk dijemput.', TRUE, 20),
  ('prohibited_item', 'Barang dilarang', 'Barang berisiko, berbahaya, atau tidak sesuai ketentuan layanan.', TRUE, 30),
  ('oversize_or_overweight', 'Melebihi kapasitas', 'Barang terlalu besar atau berat untuk kendaraan/layanan.', TRUE, 40),
  ('customer_unreachable', 'Customer tidak merespons', 'Customer tidak bisa dihubungi di titik pickup.', TRUE, 50),
  ('pickup_address_issue', 'Alamat pickup bermasalah', 'Titik/alamat pickup tidak valid atau tidak dapat diakses.', TRUE, 60),
  ('customer_cancelled_at_pickup', 'Customer batal di lokasi', 'Customer menyampaikan pembatalan saat kurir tiba.', TRUE, 70),
  ('other', 'Alasan lainnya', 'Gunakan catatan untuk menjelaskan kondisi lapangan.', TRUE, 80)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- +goose Down
DROP INDEX IF EXISTS idx_courier_pickup_cancellation_reasons_active_order;
DROP TABLE IF EXISTS courier_pickup_cancellation_reasons;
