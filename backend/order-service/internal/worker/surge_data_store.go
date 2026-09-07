package worker

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type ZoneSurgeInput struct {
	ZoneID                 string     `json:"zone_id"`
	ZoneCode               string     `json:"zone_code"`
	ServiceCode            string     `json:"service_code"`
	WindowStartedAt        time.Time  `json:"window_started_at"`
	ObservedAt             time.Time  `json:"observed_at"`
	LatestEventAt          *time.Time `json:"latest_event_at,omitempty"`
	EventAgeSeconds        int64      `json:"event_age_seconds"`
	DataFresh              bool       `json:"data_fresh"`
	WeatherMultiplier      float64    `json:"weather_multiplier"`
	PricingMultiplier      float64    `json:"pricing_multiplier"`
	SurgeMultiplier        float64    `json:"surge_multiplier"`
	DemandOrders           int        `json:"demand_orders"`
	ActiveOrders           int        `json:"active_orders"`
	AvailableCouriers      int        `json:"available_couriers"`
	IdleCouriers           int        `json:"idle_couriers"`
	AcceptanceRatePct      float64    `json:"acceptance_rate_pct"`
	AverageMatchTimeSecs   float64    `json:"average_match_time_seconds"`
	NoSupplyOrders         int        `json:"no_supply_orders"`
	AverageIdleTimeMinutes float64    `json:"average_idle_time_minutes"`
	AverageETAMinutes      float64    `json:"average_eta_minutes"`
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

	query := zoneSurgeInputsQuery

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	inputs := make([]ZoneSurgeInput, 0)
	for rows.Next() {
		var input ZoneSurgeInput
		var latestEventAt sql.NullTime
		if err := rows.Scan(
			&input.ZoneID,
			&input.ZoneCode,
			&input.ServiceCode,
			&input.WindowStartedAt,
			&input.ObservedAt,
			&latestEventAt,
			&input.EventAgeSeconds,
			&input.DataFresh,
			&input.WeatherMultiplier,
			&input.PricingMultiplier,
			&input.DemandOrders,
			&input.ActiveOrders,
			&input.AvailableCouriers,
			&input.IdleCouriers,
			&input.AcceptanceRatePct,
			&input.AverageMatchTimeSecs,
			&input.NoSupplyOrders,
			&input.AverageIdleTimeMinutes,
			&input.AverageETAMinutes,
		); err != nil {
			return nil, err
		}
		if latestEventAt.Valid {
			value := latestEventAt.Time
			input.LatestEventAt = &value
		}
		inputs = append(inputs, input)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return inputs, nil
}

// zoneSurgeInputsQuery is the canonical marketplace metrics snapshot. Supply
// is deliberately restricted to approved, online couriers in the zone whose
// availability state is idle (or has no state row, which the availability
// service treats as idle) and whose service capability matches the demand.
// Demand is scoped to a rolling window and order lifecycle events provide the
// freshness signal used by the surge worker's fail-safe.
const zoneSurgeInputsQuery = `
		WITH active_zones AS (
			SELECT id, code, polygon
			FROM zones
			WHERE is_active = TRUE
		),
		bounds AS (
			SELECT
				clock_timestamp() AS observed_at,
				clock_timestamp() - INTERVAL '15 minutes' AS window_started_at,
				clock_timestamp() - INTERVAL '5 minutes' AS freshness_cutoff
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
		),
		demand_orders AS (
			SELECT
				z.id AS zone_id,
				z.code AS zone_code,
				o.id AS order_id,
				CASE
					WHEN LOWER(COALESCE(o.service_category, '')) = 'food'
						OR LOWER(COALESCE(o.service_sub_type, '')) = 'food_delivery'
						THEN 'food_delivery'
					WHEN LOWER(COALESCE(o.service_code, '')) IN ('p2p', 'two_legs', 'three_legs', 'package_on_demand', 'on_demand')
						OR LOWER(COALESCE(o.model, '')) IN ('p2p', 'two_legs', 'three_legs')
						THEN 'on_demand'
					ELSE COALESCE(
						NULLIF(LOWER(o.service_code), ''),
						NULLIF(LOWER(o.service_sub_type), ''),
						'on_demand'
					)
				END AS service_code,
				o.status,
				o.created_at,
				o.assigned_at,
				o.pickup_location
			FROM active_zones z
			JOIN orders o ON ST_Covers(z.polygon, o.pickup_location)
			CROSS JOIN bounds b
			WHERE o.created_at >= b.window_started_at
			  AND o.status NOT IN ('pending_payment', 'scheduled', 'cancelled')
		),
		demand_event_rollup AS (
			SELECT
				d.order_id,
				MAX(oe.created_at) AS latest_event_at,
				BOOL_OR(oe.event_type IN ('searching', 'order.searching') OR oe.to_status = 'searching') AS searched,
				BOOL_OR(oe.event_type IN ('accepted', 'order.accepted') OR oe.to_status = 'accepted') AS accepted,
				BOOL_OR(oe.event_type IN ('no_courier_found', 'order.no_courier_found') OR oe.to_status = 'no_courier_found') AS no_supply
			FROM demand_orders d
			LEFT JOIN order_events oe
				ON oe.order_id = d.order_id
				AND oe.created_at >= d.created_at
			GROUP BY d.order_id
		),
		demand_rollup AS (
			SELECT
				d.zone_id,
				d.zone_code,
				d.service_code,
				COUNT(DISTINCT d.order_id)::int AS demand_orders,
				COUNT(DISTINCT d.order_id) FILTER (
					WHERE d.status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'no_courier_found')
				)::int AS active_orders,
				COUNT(DISTINCT d.order_id) FILTER (WHERE COALESCE(e.searched, FALSE))::int AS searched_orders,
				COUNT(DISTINCT d.order_id) FILTER (WHERE COALESCE(e.accepted, FALSE))::int AS accepted_orders,
				COUNT(DISTINCT d.order_id) FILTER (
					WHERE COALESCE(e.no_supply, FALSE) OR d.status = 'no_courier_found'
				)::int AS no_supply_orders,
				COALESCE(AVG(EXTRACT(EPOCH FROM (d.assigned_at - d.created_at)))
					FILTER (WHERE d.assigned_at IS NOT NULL AND d.assigned_at >= d.created_at), 0)::float8 AS average_match_time_seconds,
				MAX(e.latest_event_at) AS latest_event_at
			FROM demand_orders d
			LEFT JOIN demand_event_rollup e ON e.order_id = d.order_id
			GROUP BY d.zone_id, d.zone_code, d.service_code
		),
		service_dimensions AS (
			SELECT DISTINCT zone_id, zone_code, service_code
			FROM demand_orders
		),
		capable_idle_supply AS (
			SELECT
				sd.zone_id,
				sd.service_code,
				cp.id AS courier_id,
				CASE
					WHEN cp.current_location IS NOT NULL THEN cp.current_location
					WHEN cp.current_lat IS NOT NULL AND cp.current_lng IS NOT NULL
						AND NOT (cp.current_lat = 0 AND cp.current_lng = 0)
						THEN ST_SetSRID(ST_MakePoint(cp.current_lng, cp.current_lat), 4326)::geography
				END AS current_location,
				cas.updated_at AS idle_since
			FROM service_dimensions sd
			JOIN courier_profiles cp ON cp.current_zone_id = sd.zone_id
			LEFT JOIN courier_availability_state cas ON cas.courier_id = cp.id
			WHERE cp.is_online = TRUE
			  AND cp.is_verified = TRUE
			  AND cp.onboarding_status = 'ACTIVE'
			  AND (cas.current_state IS NULL OR cas.current_state = 'idle')
			  AND (
					sd.service_code = ANY(COALESCE(cp.service_categories, ARRAY[]::text[]))
					OR (sd.service_code = 'on_demand' AND 'on_demand' = ANY(COALESCE(cp.service_categories, ARRAY[]::text[])))
					OR (sd.service_code LIKE 'tambal_ban%' AND COALESCE(cp.allows_tambal_ban, FALSE))
					OR (sd.service_code LIKE 'towing%' AND COALESCE(cp.allows_towing, FALSE))
				)
		),
		supply_rollup AS (
			SELECT
				zone_id,
				service_code,
				COUNT(DISTINCT courier_id)::int AS available_couriers,
				COUNT(DISTINCT courier_id) FILTER (WHERE idle_since IS NOT NULL)::int AS idle_couriers,
				COALESCE(AVG(EXTRACT(EPOCH FROM (b.observed_at - idle_since)) / 60.0)
					FILTER (WHERE idle_since IS NOT NULL AND idle_since <= b.observed_at), 0)::float8 AS average_idle_time_minutes
			FROM capable_idle_supply
			CROSS JOIN bounds b
			GROUP BY zone_id, service_code
		),
		eta_rollup AS (
			SELECT
				s.zone_id,
				s.service_code,
				COALESCE(AVG(GREATEST(
					1.0,
					CEIL(ST_Distance(s.current_location, d.pickup_location) / 1000.0 * 2.5)
				)), 0)::float8 AS average_eta_minutes
			FROM capable_idle_supply s
			JOIN demand_orders d
				ON d.zone_id = s.zone_id
				AND d.service_code = s.service_code
				AND d.status NOT IN ('delivered', 'completed', 'cancelled', 'failed', 'no_courier_found')
			WHERE s.current_location IS NOT NULL
			GROUP BY s.zone_id, s.service_code
		)
		SELECT
			d.zone_id::text AS zone_id,
			d.zone_code AS zone_code,
			d.service_code,
			b.window_started_at,
			b.observed_at,
			d.latest_event_at,
			COALESCE(EXTRACT(EPOCH FROM (b.observed_at - d.latest_event_at))::bigint, -1) AS event_age_seconds,
			COALESCE(d.latest_event_at >= b.freshness_cutoff, FALSE) AS data_fresh,
			COALESCE(w.weather_multiplier, 1.0) AS weather_multiplier,
			COALESCE(p.pricing_multiplier, 1.0) AS pricing_multiplier,
			d.demand_orders,
			d.active_orders,
			COALESCE(s.available_couriers, 0) AS available_couriers,
			COALESCE(s.idle_couriers, 0) AS idle_couriers,
			CASE WHEN d.searched_orders > 0
				THEN d.accepted_orders::float8 / d.searched_orders::float8 * 100.0
				ELSE 0.0 END AS acceptance_rate_pct,
			d.average_match_time_seconds,
			d.no_supply_orders,
			COALESCE(s.average_idle_time_minutes, 0) AS average_idle_time_minutes,
			COALESCE(e.average_eta_minutes, 0) AS average_eta_minutes
		FROM demand_rollup d
		CROSS JOIN bounds b
		LEFT JOIN latest_weather w ON w.zone_id = d.zone_id
		LEFT JOIN pricing_rollup p ON p.zone_id = d.zone_id
		LEFT JOIN supply_rollup s ON s.zone_id = d.zone_id AND s.service_code = d.service_code
		LEFT JOIN eta_rollup e ON e.zone_id = d.zone_id AND e.service_code = d.service_code
		ORDER BY d.zone_code ASC, d.service_code ASC
	`
