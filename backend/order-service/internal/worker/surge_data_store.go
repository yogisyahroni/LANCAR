package worker

import (
	"context"
	"database/sql"
	"fmt"
)

type ZoneSurgeInput struct {
	ZoneID            string
	ZoneCode          string
	WeatherMultiplier float64
	PricingMultiplier float64
	ActiveOrders      int
	AvailableCouriers int
}

type SurgeDataStore interface {
	ListZoneSurgeInputs(ctx context.Context) ([]ZoneSurgeInput, error)
}

type PostgresSurgeDataStore struct {
	db *sql.DB
}

func NewPostgresSurgeDataStore(db *sql.DB) *PostgresSurgeDataStore {
	return &PostgresSurgeDataStore{db: db}
}

func (s *PostgresSurgeDataStore) ListZoneSurgeInputs(ctx context.Context) ([]ZoneSurgeInput, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("surge datastore database is not configured")
	}

	query := `
		WITH active_zones AS (
			SELECT id, code, polygon
			FROM zones
			WHERE is_active = TRUE
		),
		latest_weather AS (
			SELECT DISTINCT ON (zone_id)
				zone_id,
				GREATEST(surge_multiplier::float8, 1.0) AS weather_multiplier
			FROM weather_logs
			WHERE is_applied = TRUE
			  AND polled_at >= NOW() - INTERVAL '30 minutes'
			ORDER BY zone_id, polled_at DESC
		),
		latest_pricing AS (
			SELECT DISTINCT ON (zone_id, factor)
				zone_id,
				factor,
				GREATEST(multiplier::float8, 1.0) AS multiplier
			FROM dynamic_pricing_logs
			WHERE applied_at <= NOW()
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY zone_id, factor, applied_at DESC
		),
		pricing_rollup AS (
			SELECT zone_id, COALESCE(MAX(multiplier), 1.0) AS pricing_multiplier
			FROM latest_pricing
			GROUP BY zone_id
		)
		SELECT
			z.id::text AS zone_id,
			z.code AS zone_code,
			COALESCE(w.weather_multiplier, 1.0) AS weather_multiplier,
			COALESCE(p.pricing_multiplier, 1.0) AS pricing_multiplier,
			COALESCE(oc.active_orders, 0) AS active_orders,
			COALESCE(cc.available_couriers, 0) AS available_couriers
		FROM active_zones z
		LEFT JOIN latest_weather w ON w.zone_id = z.id
		LEFT JOIN pricing_rollup p ON p.zone_id = z.id
		LEFT JOIN (
			SELECT
				z2.id AS zone_id,
				COUNT(o.id)::int AS active_orders
			FROM active_zones z2
			LEFT JOIN orders o
			  ON ST_Covers(z2.polygon, o.pickup_location)
			 AND o.status NOT IN ('delivered', 'completed', 'cancelled', 'failed')
			 AND o.status <> 'pending_payment'
			GROUP BY z2.id
		) oc ON oc.zone_id = z.id
		LEFT JOIN (
			SELECT current_zone_id AS zone_id, COUNT(*)::int AS available_couriers
			FROM courier_profiles
			WHERE is_online = TRUE
			  AND verification_status = 'approved'
			  AND current_zone_id IS NOT NULL
			GROUP BY current_zone_id
		) cc ON cc.zone_id = z.id
		ORDER BY z.code ASC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	inputs := make([]ZoneSurgeInput, 0)
	for rows.Next() {
		var input ZoneSurgeInput
		if err := rows.Scan(
			&input.ZoneID,
			&input.ZoneCode,
			&input.WeatherMultiplier,
			&input.PricingMultiplier,
			&input.ActiveOrders,
			&input.AvailableCouriers,
		); err != nil {
			return nil, err
		}
		inputs = append(inputs, input)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return inputs, nil
}
