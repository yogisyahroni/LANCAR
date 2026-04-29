-- +goose Up
CREATE MATERIALIZED VIEW mv_three_legs_readiness AS
SELECT
    z.id AS zone_id,
    z.name AS zone_name,
    COUNT(c.id) AS active_couriers
FROM zones z
LEFT JOIN courier_zones cz ON z.id = cz.zone_id
LEFT JOIN courier_profiles c ON cz.courier_id = c.id AND c.is_online = true
GROUP BY z.id, z.name;

CREATE UNIQUE INDEX idx_mv_three_legs_readiness_zone_id ON mv_three_legs_readiness(zone_id);

-- +goose Down
DROP MATERIALIZED VIEW IF EXISTS mv_three_legs_readiness;
