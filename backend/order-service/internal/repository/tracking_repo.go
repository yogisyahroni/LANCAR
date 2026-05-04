package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"lancar/order-service/internal/domain"
)

type PostgresTrackingRepo struct {
	db *sqlx.DB
}

func NewPostgresTrackingRepo(db *sqlx.DB) *PostgresTrackingRepo {
	return &PostgresTrackingRepo{db: db}
}

func (r *PostgresTrackingRepo) SaveGPSLog(ctx context.Context, courierID uuid.UUID, orderID *uuid.UUID, loc domain.GPSLocation, isSpoofed bool) error {
	query := `
		INSERT INTO courier_gps_logs (
			courier_id, order_leg_id, location, accuracy_m, speed_kmh, heading_deg, is_spoofed, recorded_at
		) VALUES (
			$1, 
			(SELECT id FROM order_legs WHERE order_id = $2 AND status IN ('pending', 'in_progress') LIMIT 1), 
			ST_SetSRID(ST_MakePoint($3, $4), 4326), 
			$5, $6, $7, $8, $9
		)
	`
	// If orderID is nil, we just pass nil to $2 which makes the subquery return NULL.
	var oID interface{}
	if orderID != nil {
		oID = *orderID
	} else {
		oID = nil
	}

	_, err := r.db.ExecContext(ctx, query,
		courierID, oID, loc.Longitude, loc.Latitude, loc.Accuracy, loc.Speed, loc.Heading, isSpoofed, loc.Timestamp,
	)
	return err
}

func (r *PostgresTrackingRepo) UpdateCourierLocation(ctx context.Context, courierID uuid.UUID, loc domain.GPSLocation) error {
	// Courier profiles might be in auth-service or shared db, assuming shared for now based on previous patterns
	query := `
		UPDATE courier_profiles 
		SET current_location = ST_SetSRID(ST_MakePoint($2, $3), 4326), 
		    last_active_at = NOW() 
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query, courierID, loc.Longitude, loc.Latitude)
	return err
}

func (r *PostgresTrackingRepo) GetLatestLocation(ctx context.Context, courierID uuid.UUID) (*domain.GPSLocation, error) {
	query := `
		SELECT 
			ST_Y(location::geometry) as latitude,
			ST_X(location::geometry) as longitude,
			COALESCE(accuracy_m, 0) as accuracy,
			COALESCE(speed_kmh, 0) as speed,
			COALESCE(heading_deg, 0) as heading,
			recorded_at as timestamp
		FROM courier_gps_logs 
		WHERE courier_id = $1 
		ORDER BY recorded_at DESC 
		LIMIT 1
	`
	var loc domain.GPSLocation
	err := r.db.GetContext(ctx, &loc, query, courierID)
	if err != nil {
		return nil, err
	}
	return &loc, nil
}

func (r *PostgresTrackingRepo) GetIdleCouriers(ctx context.Context, thresholdMinutes int) ([]uuid.UUID, error) {
	query := `
		SELECT id 
		FROM courier_profiles 
		WHERE status = 'online' 
		  AND last_active_at < NOW() - INTERVAL '1 minute' * $1
	`
	var ids []uuid.UUID
	err := r.db.SelectContext(ctx, &ids, query, thresholdMinutes)
	return ids, err
}

func (r *PostgresTrackingRepo) SetCourierOffline(ctx context.Context, courierID uuid.UUID) error {
	query := `UPDATE courier_profiles SET status = 'offline' WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, courierID)
	return err
}

func (r *PostgresTrackingRepo) GetActiveCourierForOrder(ctx context.Context, orderID uuid.UUID) (*uuid.UUID, error) {
	query := `
		SELECT courier_id 
		FROM order_legs 
		WHERE order_id = $1 AND status IN ('pending', 'in_progress') 
		LIMIT 1
	`
	var courierID uuid.UUID
	err := r.db.GetContext(ctx, &courierID, query, orderID)
	if err != nil {
		return nil, err
	}
	return &courierID, nil
}

// CheckGeofence performs a PostGIS ST_Contains spatial query to determine whether
// the courier's current position falls within their assigned zone polygon.
//
// Algorithm:
//  1. Find the active order leg for this courier and its assigned zone.
//  2. Use ST_Contains(zone.boundary, ST_SetSRID(ST_MakePoint(lng, lat), 4326)) to check.
//  3. If outside, calculate how many minutes ago the courier first left the zone by
//     scanning the recent GPS log for the earliest consecutive out-of-zone reading.
func (r *PostgresTrackingRepo) CheckGeofence(ctx context.Context, courierID uuid.UUID, lat, lng float64) (*domain.GeofenceCheckResult, error) {
	// Find the active order leg and its zone boundary for this courier
	type geofenceRow struct {
		IsInside bool    `db:"is_inside"`
		ZoneID   *string `db:"zone_id"`
	}

	var row geofenceRow
	checkQuery := `
		SELECT 
			ST_Contains(
				z.boundary::geometry,
				ST_SetSRID(ST_MakePoint($2, $1), 4326)
			) AS is_inside,
			z.id::text AS zone_id
		FROM order_legs ol
		JOIN zones z ON z.id = ol.zone_id
		WHERE ol.courier_id = $3
		  AND ol.status IN ('pending', 'in_progress')
		ORDER BY ol.created_at DESC
		LIMIT 1
	`

	err := r.db.GetContext(ctx, &row, checkQuery, lat, lng, courierID)
	if err != nil {
		// No active leg or zone found — treat as inside zone to avoid false alerts
		return &domain.GeofenceCheckResult{IsInsideZone: true}, nil
	}

	if row.IsInside {
		return &domain.GeofenceCheckResult{
			IsInsideZone:     true,
			OutOfZoneMinutes: 0,
			AssignedZoneID:   row.ZoneID,
		}, nil
	}

	// Courier is outside the zone — calculate how long they've been out
	// Find the earliest consecutive GPS log reading that was also outside the zone
	outDurationQuery := `
		WITH ranked_logs AS (
			SELECT
				recorded_at,
				ST_Contains(
					z.boundary::geometry,
					location::geometry
				) AS was_inside,
				ROW_NUMBER() OVER (ORDER BY recorded_at DESC) AS rn
			FROM courier_gps_logs gl
			JOIN order_legs ol ON ol.courier_id = gl.courier_id
				AND ol.status IN ('pending', 'in_progress')
			JOIN zones z ON z.id = ol.zone_id
			WHERE gl.courier_id = $1
			  AND gl.recorded_at > NOW() - INTERVAL '2 hours'
			ORDER BY gl.recorded_at DESC
		)
		SELECT COALESCE(
			EXTRACT(EPOCH FROM (NOW() - MIN(recorded_at))) / 60,
			0
		)::INT AS out_of_zone_minutes
		FROM ranked_logs
		WHERE was_inside = FALSE
		  AND rn <= (
			-- Find the first row where the courier was inside, then take all rows before it
			SELECT COALESCE(MIN(rn) - 1, 9999)
			FROM ranked_logs
			WHERE was_inside = TRUE
		  )
	`

	var outMinutes int
	if durationErr := r.db.GetContext(ctx, &outMinutes, outDurationQuery, courierID); durationErr != nil {
		// If we can't calculate duration, default to 0 (won't trigger alert)
		outMinutes = 0
	}

	return &domain.GeofenceCheckResult{
		IsInsideZone:     false,
		OutOfZoneMinutes: outMinutes,
		AssignedZoneID:   row.ZoneID,
	}, nil
}

