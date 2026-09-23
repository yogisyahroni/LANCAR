-- +goose Up
INSERT INTO provider_area_mappings (
    id,
    provider_code,
    postal_code,
    district_name,
    city_name,
    province_name,
    provider_area_code,
    provider_branch_code
)
VALUES
    ('map-jnt-cgk1', 'jnt', '10110', 'Gambir', 'Jakarta Pusat', 'DKI Jakarta', 'CGK10000', 'JNT-CGK-01'),
    ('map-jnt-cgk2', 'jnt', '12110', 'Kebayoran Baru', 'Jakarta Selatan', 'DKI Jakarta', 'CGK20000', 'JNT-CGK-02'),
    ('map-jnt-bdo1', 'jnt', '40111', 'Coblong', 'Bandung', 'Jawa Barat', 'BDO10000', 'JNT-BDO-01'),
    ('map-jnt-dps1', 'jnt', '80111', 'Denpasar Barat', 'Denpasar', 'Bali', 'DPS10000', 'JNT-DPS-01'),
    ('map-jnt-mes1', 'jnt', '20111', 'Medan Baru', 'Medan', 'Sumatera Utara', 'MES10000', 'JNT-MES-01'),
    ('map-jnt-smg1', 'jnt', '50134', 'Semarang Tengah', 'Semarang', 'Jawa Tengah', 'SMG10000', 'JNT-SMG-01'),
    ('map-jnt-sub1', 'jnt', '60111', 'Tegalsari', 'Surabaya', 'Jawa Timur', 'SUB10000', 'JNT-SUB-01'),
    ('map-jnt-yog1', 'jnt', '55213', 'Danurejan', 'Yogyakarta', 'DI Yogyakarta', 'YOG10000', 'JNT-YOG-01')
ON CONFLICT (id) DO UPDATE SET
    provider_code = EXCLUDED.provider_code,
    postal_code = EXCLUDED.postal_code,
    district_name = EXCLUDED.district_name,
    city_name = EXCLUDED.city_name,
    province_name = EXCLUDED.province_name,
    provider_area_code = EXCLUDED.provider_area_code,
    provider_branch_code = EXCLUDED.provider_branch_code;

-- +goose Down
DELETE FROM provider_area_mappings
WHERE id IN (
    'map-jnt-cgk1',
    'map-jnt-cgk2',
    'map-jnt-bdo1',
    'map-jnt-dps1',
    'map-jnt-mes1',
    'map-jnt-smg1',
    'map-jnt-sub1',
    'map-jnt-yog1'
);
