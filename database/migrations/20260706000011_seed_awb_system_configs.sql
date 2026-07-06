-- +goose Up
-- Seed konfigurasi AWB ke system_configs.
-- Semua nilai ini dapat diubah oleh admin melalui dashboard tanpa deploy ulang.
-- PENTING: Ganti nilai placeholder dengan konfigurasi JNE/J&T yang sebenarnya.

INSERT INTO system_configs (key, value, description, category) VALUES
  ('awb_default_provider',  '"jne"',      'Provider AWB default: "jne" atau "jnt"',                        'awb'),
  ('awb_origin_code',       '""',         'Kode kota asal pengiriman (contoh: "CGK" untuk Jakarta). WAJIB diisi agar AWB aktif.', 'awb'),
  ('awb_destination_code',  '""',         'Kode kota tujuan pengiriman default. Bisa dikosongkan jika dinamis.', 'awb'),
  ('awb_service_type',      '"REG"',      'Tipe layanan AWB: REG, YES, OKE (JNE) atau EZ (J&T)',            'awb'),
  ('awb_sender_name',       '"TEMBUS"',   'Nama pengirim yang muncul di resi AWB',                          'awb'),
  ('awb_sender_phone',      '""',         'Nomor telepon pengirim untuk resi AWB',                          'awb'),
  ('awb_sender_address',    '""',         'Alamat pengirim default (fallback jika pickup_address kosong)',   'awb'),
  ('payment_link_base_url', '"https://tembus.id/pay"', 'Base URL untuk link pembayaran yang dikirim via WhatsApp', 'payment_link')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DELETE FROM system_configs WHERE key IN (
  'awb_default_provider', 'awb_origin_code', 'awb_destination_code',
  'awb_service_type', 'awb_sender_name', 'awb_sender_phone',
  'awb_sender_address', 'payment_link_base_url'
);
