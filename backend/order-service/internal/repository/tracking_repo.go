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
