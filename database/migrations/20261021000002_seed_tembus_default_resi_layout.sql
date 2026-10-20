-- RESI-2026-002: replace the legacy minimal/default receipt with the
-- TEMBUS-branded A6 layout used by the designer and customer renderer.

-- +goose Up

UPDATE resi_templates
SET name = 'TEMBUS Standard A6',
    paper_size = 'A6',
    layout_config = jsonb_build_object(
        'layout', 'tembus_v5',
        'elements', jsonb_build_array(
            jsonb_build_object('id', id::text || '-logo', 'type', 'tembus_logo', 'x', 12, 'y', 10, 'value', '', 'width', 128, 'height', 32),
            jsonb_build_object('id', id::text || '-cod', 'type', 'text', 'x', 248, 'y', 18, 'value', 'COD: {{cod_amount}}', 'fontSize', 13, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-line-1', 'type', 'h_line', 'x', 10, 'y', 52, 'value', '', 'width', 364, 'height', 2),
            jsonb_build_object('id', id::text || '-awb-label', 'type', 'text', 'x', 12, 'y', 62, 'value', 'No. Resi', 'fontSize', 10, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-awb-barcode', 'type', 'barcode', 'x', 142, 'y', 60, 'value', '{{awb_number}}', 'width', 230, 'height', 46, 'barWidth', 1.7),
            jsonb_build_object('id', id::text || '-awb-value', 'type', 'text', 'x', 144, 'y', 110, 'value', '{{awb_number}}', 'fontSize', 9),
            jsonb_build_object('id', id::text || '-weight', 'type', 'text', 'x', 12, 'y', 120, 'value', 'BERAT: {{weight}}', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-qty', 'type', 'text', 'x', 132, 'y', 120, 'value', 'QTY: {{total_items}} PCS', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-service', 'type', 'text', 'x', 270, 'y', 120, 'value', '{{service_name}}', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-line-2', 'type', 'h_line', 'x', 10, 'y', 140, 'value', '', 'width', 364, 'height', 2),
            jsonb_build_object('id', id::text || '-sender-label', 'type', 'text', 'x', 12, 'y', 150, 'value', 'PENGIRIM', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-sender-name', 'type', 'text', 'x', 12, 'y', 166, 'value', '{{sender_name}}', 'fontSize', 10, 'fontWeight', 'bold', 'width', 172),
            jsonb_build_object('id', id::text || '-sender-phone', 'type', 'text', 'x', 12, 'y', 182, 'value', '{{sender_phone}}', 'fontSize', 9, 'width', 172),
            jsonb_build_object('id', id::text || '-sender-address', 'type', 'text', 'x', 12, 'y', 198, 'value', '{{sender_address}}', 'fontSize', 9, 'width', 172, 'height', 48),
            jsonb_build_object('id', id::text || '-receiver-label', 'type', 'text', 'x', 204, 'y', 150, 'value', 'PENERIMA', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-receiver-name', 'type', 'text', 'x', 204, 'y', 166, 'value', '{{receiver_name}}', 'fontSize', 10, 'fontWeight', 'bold', 'width', 168),
            jsonb_build_object('id', id::text || '-receiver-phone', 'type', 'text', 'x', 204, 'y', 182, 'value', '{{receiver_phone}}', 'fontSize', 9, 'width', 168),
            jsonb_build_object('id', id::text || '-receiver-address', 'type', 'text', 'x', 204, 'y', 198, 'value', '{{receiver_address}}', 'fontSize', 9, 'width', 168, 'height', 48),
            jsonb_build_object('id', id::text || '-line-3', 'type', 'h_line', 'x', 10, 'y', 258, 'value', '', 'width', 364, 'height', 2),
            jsonb_build_object('id', id::text || '-content-label', 'type', 'text', 'x', 12, 'y', 268, 'value', 'ISI PAKET', 'fontSize', 9, 'fontWeight', 'bold'),
            jsonb_build_object('id', id::text || '-content', 'type', 'text', 'x', 12, 'y', 284, 'value', '{{item_description}}', 'fontSize', 10, 'width', 360, 'height', 32),
            jsonb_build_object('id', id::text || '-line-4', 'type', 'h_line', 'x', 10, 'y', 330, 'value', '', 'width', 364, 'height', 2),
            jsonb_build_object('id', id::text || '-tracking-qr', 'type', 'qrcode', 'x', 16, 'y', 344, 'value', '{{tracking_url}}', 'width', 78, 'height', 78),
            jsonb_build_object('id', id::text || '-tracking-label', 'type', 'text', 'x', 110, 'y', 350, 'value', 'SCAN QR UNTUK LACAK PAKET', 'fontSize', 10, 'fontWeight', 'bold', 'width', 250),
            jsonb_build_object('id', id::text || '-tracking-copy', 'type', 'text', 'x', 110, 'y', 370, 'value', 'Lacak status pengiriman di sistem TEMBUS.', 'fontSize', 9, 'width', 250, 'height', 30),
            jsonb_build_object('id', id::text || '-line-5', 'type', 'h_line', 'x', 10, 'y', 445, 'value', '', 'width', 364, 'height', 2),
            jsonb_build_object('id', id::text || '-order-label', 'type', 'text', 'x', 12, 'y', 456, 'value', 'Order ID: {{order_id}}', 'fontSize', 9, 'fontWeight', 'bold', 'width', 145),
            jsonb_build_object('id', id::text || '-order-barcode', 'type', 'barcode', 'x', 160, 'y', 450, 'value', '{{order_id}}', 'width', 210, 'height', 38, 'barWidth', 1.2),
            jsonb_build_object('id', id::text || '-footer', 'type', 'text', 'x', 12, 'y', 516, 'value', 'Powered by TEMBUS · tembus.id', 'fontSize', 9, 'fontWeight', 'bold')
        )
    ),
    updated_at = NOW()
WHERE is_active = true
  AND (
      provider_code IS NULL
      OR name ILIKE '%LANCAR%'
      OR name ILIKE '%TEMBUS%'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(layout_config->'elements', '[]'::jsonb)) AS element
      WHERE element->>'type' = 'tembus_logo'
  );

INSERT INTO resi_templates (id, name, paper_size, layout_config, is_active, provider_code)
SELECT
    gen_random_uuid(),
    'TEMBUS Standard A6',
    'A6',
    jsonb_build_object(
        'layout', 'tembus_v5',
        'elements', jsonb_build_array(
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'tembus_logo', 'x', 12, 'y', 10, 'value', '', 'width', 128, 'height', 32),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 62, 'value', 'No. Resi: {{awb_number}}', 'fontSize', 13, 'fontWeight', 'bold'),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'barcode', 'x', 12, 'y', 90, 'value', '{{awb_number}}', 'width', 360, 'height', 46, 'barWidth', 1.7),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 150, 'value', 'PENGIRIM: {{sender_name}}', 'fontSize', 10, 'fontWeight', 'bold'),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 168, 'value', '{{sender_address}}', 'fontSize', 9, 'width', 360, 'height', 42),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 230, 'value', 'PENERIMA: {{receiver_name}}', 'fontSize', 10, 'fontWeight', 'bold'),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 248, 'value', '{{receiver_address}}', 'fontSize', 9, 'width', 360, 'height', 42),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'qrcode', 'x', 12, 'y', 320, 'value', '{{tracking_url}}', 'width', 82, 'height', 82),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 110, 'y', 330, 'value', 'Lacak paket melalui TEMBUS', 'fontSize', 11, 'fontWeight', 'bold'),
            jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'x', 12, 'y', 440, 'value', 'Order ID: {{order_id}} · Powered by TEMBUS', 'fontSize', 9, 'fontWeight', 'bold')
        )
    ),
    true,
    NULL
WHERE NOT EXISTS (
    SELECT 1 FROM resi_templates WHERE provider_code IS NULL AND is_active = true
);

-- +goose Down

-- The migration intentionally keeps the canonical TEMBUS layout on rollback;
-- removing it would restore an unusable legacy default.
