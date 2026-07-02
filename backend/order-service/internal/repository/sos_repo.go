package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"tembus/order-service/internal/domain"
)

type PostgresSosRepo struct {
	db *sqlx.DB
}

func NewPostgresSosRepo(db *sqlx.DB) *PostgresSosRepo {
	return &PostgresSosRepo{db: db}
}

func (r *PostgresSosRepo) CreateIncident(ctx context.Context, incident *domain.SosIncident) error {
	query := `
		INSERT INTO courier_sos_incidents (
			id, victim_courier_id, latitude, longitude, status, created_at, updated_at
		) VALUES (
			:id, :victim_courier_id, :latitude, :longitude, :status, :created_at, :updated_at
		)
	`
	_, err := r.db.NamedExecContext(ctx, query, incident)
	return err
}

func (r *PostgresSosRepo) GetIncidentByID(ctx context.Context, id uuid.UUID) (*domain.SosIncident, error) {
	query := `SELECT * FROM courier_sos_incidents WHERE id = $1`
	var incident domain.SosIncident
	if err := r.db.GetContext(ctx, &incident, query, id); err != nil {
		return nil, err
	}
	return &incident, nil
}

func (r *PostgresSosRepo) UpdateIncident(ctx context.Context, incident *domain.SosIncident) error {
	query := `
		UPDATE courier_sos_incidents
		SET status = $2, resolved_at = $3, resolution_photo_url = $4, updated_at = $5
		WHERE id = $1 AND status IN ('BROADCASTED', 'ACCEPTED')
	`
	res, err := r.db.ExecContext(ctx, query, incident.ID, incident.Status, incident.ResolvedAt, incident.ResolutionPhotoURL, incident.UpdatedAt)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("incident already resolved or not found")
	}
	return nil
}

func (r *PostgresSosRepo) GetStaleIncidents(ctx context.Context, olderThan time.Duration) ([]domain.SosIncident, error) {
	query := `
		SELECT * FROM courier_sos_incidents
		WHERE (status = 'BROADCASTED' OR status = 'ACCEPTED')
		  AND created_at < $1
	`
	threshold := time.Now().Add(-olderThan)
	var incidents []domain.SosIncident
	err := r.db.SelectContext(ctx, &incidents, query, threshold)
	return incidents, err
}

func (r *PostgresSosRepo) SetPriorityMultiplier(ctx context.Context, courierID uuid.UUID, duration time.Duration) error {
	// The new column we added is priority_multiplier_until in courier_profiles (or couriers)
	// We check the migration: ALTER TABLE couriers ADD COLUMN priority_multiplier_until TIMESTAMPTZ;
	query := `
		UPDATE couriers 
		SET priority_multiplier_until = NOW() + $2::interval 
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query, courierID, duration.String())
	return err
}

func (r *PostgresSosRepo) CountFakeSOSByVictim(ctx context.Context, victimID uuid.UUID) (int, error) {
	query := `
		SELECT COUNT(*) 
		FROM courier_sos_incidents 
		WHERE victim_courier_id = $1 AND status = 'RESOLVED_FAKE'
	`
	var count int
	err := r.db.GetContext(ctx, &count, query, victimID)
	return count, err
}

func (r *PostgresSosRepo) SuspendCourier(ctx context.Context, courierID uuid.UUID, duration time.Duration) error {
	query := `UPDATE users SET status = 'suspended', suspended_until = NOW() + $2 * INTERVAL '1 second'
	          WHERE id = (SELECT user_id FROM courier_profiles WHERE id = $1)`
	_, err := r.db.ExecContext(ctx, query, courierID, duration.Seconds())
	return err
}

func (r *PostgresSosRepo) TerminateCourier(ctx context.Context, courierID uuid.UUID) error {
	query := `
		UPDATE users 
		SET status = 'inactive'
		WHERE id = (SELECT user_id FROM courier_profiles WHERE id = $1)
	`
	_, err := r.db.ExecContext(ctx, query, courierID)
	return err
}

func (r *PostgresSosRepo) AddHelperToIncident(ctx context.Context, incidentID, helperID uuid.UUID) error {
	query := `
		INSERT INTO courier_sos_helpers (incident_id, helper_courier_id, status)
		VALUES ($1, $2, 'ACCEPTED')
	`
	_, err := r.db.ExecContext(ctx, query, incidentID, helperID)
	return err
}

func (r *PostgresSosRepo) GetHelpersByIncident(ctx context.Context, incidentID uuid.UUID) ([]domain.SosHelper, error) {
	query := `SELECT * FROM courier_sos_helpers WHERE incident_id = $1`
	var helpers []domain.SosHelper
	err := r.db.SelectContext(ctx, &helpers, query, incidentID)
	return helpers, err
}

func (r *PostgresSosRepo) GetHelperCountByIncident(ctx context.Context, incidentID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM courier_sos_helpers WHERE incident_id = $1`
	var count int
	err := r.db.GetContext(ctx, &count, query, incidentID)
	return count, err
}

func (r *PostgresSosRepo) UpdateHelperReport(ctx context.Context, incidentID, helperID uuid.UUID, verdict string, photoURL string) error {
	query := `
		UPDATE courier_sos_helpers
		SET verdict = $3, photo_url = $4, reported_at = CURRENT_TIMESTAMP, status = 'REPORTED'
		WHERE incident_id = $1 AND helper_courier_id = $2
	`
	_, err := r.db.ExecContext(ctx, query, incidentID, helperID, verdict, photoURL)
	return err
}

func (r *PostgresSosRepo) UpdateHelperStatus(ctx context.Context, incidentID, helperID uuid.UUID, status string) error {
	query := `
		UPDATE courier_sos_helpers
		SET status = $3, updated_at = CURRENT_TIMESTAMP
		WHERE incident_id = $1 AND helper_courier_id = $2
	`
	_, err := r.db.ExecContext(ctx, query, incidentID, helperID, status)
	return err
}

func (r *PostgresSosRepo) MarkAsTampered(ctx context.Context, incidentID uuid.UUID) error {
	query := `
		UPDATE courier_sos_incidents
		SET is_tampered = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`
	_, err := r.db.ExecContext(ctx, query, incidentID)
	return err
}

// GetNearbyCouriersForSOS mencari kurir yang memenuhi semua syarat berikut:
// 1. Status 'online' (sedang bertugas)
// 2. Berada dalam radius radiusMeters meter dari titik SOS
// 3. IDLE: tidak sedang mengerjakan order aktif apapun (NOT EXISTS active order_leg)
// Hasilnya diurutkan dari yang paling dekat ke paling jauh, maksimal `limit` kurir.
func (r *PostgresSosRepo) GetNearbyCouriersForSOS(ctx context.Context, lat, lng float64, radiusMeters float64, limit int) ([]domain.NearbyCourier, error) {
	query := `
		SELECT
			cp.id AS courier_profile_id,
			cp.user_id,
			ST_Distance(
				cp.current_location::geography,
				ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
			) AS distance_meters
		FROM courier_profiles cp
		WHERE cp.status = 'online'
		  AND cp.current_location IS NOT NULL
		  AND ST_DWithin(
				cp.current_location::geography,
				ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
				$3
		  )
		  -- Hanya kurir IDLE: tidak punya order_leg yang sedang aktif
		  AND NOT EXISTS (
				SELECT 1
				FROM order_legs ol
				WHERE ol.courier_id = cp.user_id
				  AND ol.status IN ('pending', 'assigned', 'accepted', 'picked_up', 'in_progress', 'in_transit')
		  )
		ORDER BY cp.current_location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geometry
		LIMIT $4
	`
	var couriers []domain.NearbyCourier
	if err := r.db.SelectContext(ctx, &couriers, query, lat, lng, radiusMeters, limit); err != nil {
		return nil, err
	}
	return couriers, nil
}

func (r *PostgresSosRepo) GetUserIDByCourierProfileID(ctx context.Context, profileID uuid.UUID) (uuid.UUID, error) {
	var userID uuid.UUID
	err := r.db.GetContext(ctx, &userID, "SELECT user_id FROM courier_profiles WHERE id = $1", profileID)
	return userID, err
}

func (r *PostgresSosRepo) GetUserNameByID(ctx context.Context, userID uuid.UUID) (string, error) {
	var name string
	err := r.db.GetContext(ctx, &name, "SELECT full_name FROM users WHERE id = $1", userID)
	return name, err
}

// GetFCMTokensByUserIDs mengambil semua FCM device token yang aktif (max 30 hari)
// untuk sejumlah user ID sekaligus. Mengembalikan map[userID][]tokens.
func (r *PostgresSosRepo) GetFCMTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	if len(userIDs) == 0 {
		return map[uuid.UUID][]string{}, nil
	}

	query := `
		SELECT user_id, device_token
		FROM user_devices
		WHERE user_id = ANY($1)
		  AND last_active_at > NOW() - INTERVAL '30 days'
	`
	type row struct {
		UserID      uuid.UUID `db:"user_id"`
		DeviceToken string    `db:"device_token"`
	}
	var rows []row
	if err := r.db.SelectContext(ctx, &rows, query, pq.Array(userIDs)); err != nil {
		return nil, err
	}

	result := make(map[uuid.UUID][]string, len(userIDs))
	for _, row := range rows {
		result[row.UserID] = append(result[row.UserID], row.DeviceToken)
	}
	return result, nil
}
