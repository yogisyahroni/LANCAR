-- +goose Up
-- +goose StatementBegin
INSERT INTO system_configs (key, value, description, category) 
VALUES 
    ('payment_link_expiry_minutes', '10', 'Durasi waktu sebelum payment link kedaluwarsa (dalam menit)', 'Order & Payment'),
    ('payment_link_default_weight_kg', '1.0', 'Berat default pengiriman (KG) jika tidak ditentukan', 'Logistics'),
    ('awb_tracking_url_template', '"https://cekresi.com/?noresi=%s"', 'Format URL untuk melacak resi pengiriman AWB', 'Logistics')
ON CONFLICT (key) DO UPDATE 
SET 
    description = EXCLUDED.description,
    category = EXCLUDED.category;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM system_configs WHERE key IN ('payment_link_expiry_minutes', 'payment_link_default_weight_kg', 'awb_tracking_url_template');
-- +goose StatementEnd
