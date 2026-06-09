package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"

	"tembus/order-service/internal/domain"
)

// PostgresAntiFakeGPSRepo implements domain.AntiFakeGPSRepository using PostgreSQL.
type PostgresAntiFakeGPSRepo struct {
	db *sqlx.DB
}

func NewPostgresAntiFakeGPSRepo(db *sqlx.DB) *PostgresAntiFakeGPSRepo {
	return &PostgresAntiFakeGPSRepo{db: db}
}

// InsertViolation records a new GPS integrity violation event for audit trail
// and graduated response enforcement.
func (r *PostgresAntiFakeGPSRepo) InsertViolation(ctx context.Context, event domain.GPSViolationEvent) error {
	query := `
		INSERT INTO courier_gps_violations (
			id, courier_id, risk_score, risk_level, action_taken,
			latitude, longitude, device_id,
			fake_gps_apps, developer_options, mock_setting_enabled,
			sensor_integrity, accelerometer_ok, gyroscope_ok, barometer_ok,
			step_counter_ok, is_rooted,
			created_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8,
			$9, $10, $11,
			$12, $13, $14, $15,
			$16, $17,
			$18
		)
	`

	_, err := r.db.ExecContext(ctx, query,
		event.ID,
		event.CourierID,
		event.RiskScore,
		string(event.RiskLevel),
		string(event.ActionTaken),
		event.Latitude,
		event.Longitude,
		event.DeviceID,
		pq.Array(event.Telemetry.FakeGpsApps),
		event.Telemetry.DeveloperOptions,
		event.Telemetry.MockSettingEnabled,
		event.Telemetry.SensorIntegrity,
		event.Telemetry.AccelerometerOk,
		event.Telemetry.GyroscopeOk,
		event.Telemetry.BarometerOk,
		event.Telemetry.StepCounterOk,
		event.Telemetry.IsRooted,
		event.CreatedAt,
	)
	return err
}

// CountViolations counts the number of GPS integrity violations for a courier
// since a given timestamp. Used by the graduated response engine.
func (r *PostgresAntiFakeGPSRepo) CountViolations(ctx context.Context, courierID uuid.UUID, since time.Time) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM courier_gps_violations
		WHERE courier_id = $1
		  AND created_at >= $2
		  AND risk_level IN ('SUSPICIOUS', 'FAKE_GPS_DETECTED')
	`

	var count int
	err := r.db.GetContext(ctx, &count, query, courierID, since)
	return count, err
}

// GetRecentViolations retrieves the most recent GPS violations for a courier,
// ordered by creation time descending. Used by admin dashboard and appeal process.
func (r *PostgresAntiFakeGPSRepo) GetRecentViolations(ctx context.Context, courierID uuid.UUID, limit int) ([]domain.GPSViolationEvent, error) {
	query := `
		SELECT 
			id, courier_id, risk_score, risk_level, action_taken,
			latitude, longitude, device_id, created_at
		FROM courier_gps_violations
		WHERE courier_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	type row struct {
		ID          uuid.UUID `db:"id"`
		CourierID   uuid.UUID `db:"courier_id"`
		RiskScore   float64   `db:"risk_score"`
		RiskLevel   string    `db:"risk_level"`
		ActionTaken string    `db:"action_taken"`
		Latitude    float64   `db:"latitude"`
		Longitude   float64   `db:"longitude"`
		DeviceID    string    `db:"device_id"`
		CreatedAt   time.Time `db:"created_at"`
	}

	var rows []row
	if err := r.db.SelectContext(ctx, &rows, query, courierID, limit); err != nil {
		return nil, err
	}

	events := make([]domain.GPSViolationEvent, len(rows))
	for i, r := range rows {
		events[i] = domain.GPSViolationEvent{
			ID:          r.ID,
			CourierID:   r.CourierID,
			RiskScore:   r.RiskScore,
			RiskLevel:   domain.RiskLevel(r.RiskLevel),
			ActionTaken: domain.GraduatedAction(r.ActionTaken),
			Latitude:    r.Latitude,
			Longitude:   r.Longitude,
			DeviceID:    r.DeviceID,
			CreatedAt:   r.CreatedAt,
		}
	}

	return events, nil
}
