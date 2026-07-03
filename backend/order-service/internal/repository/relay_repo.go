package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
	"tembus/order-service/internal/domain"
)

type relayRepository struct {
	db    *sqlx.DB
	redis *redis.Client
}

func NewRelayRepository(db *sqlx.DB, redis *redis.Client) domain.RelayRepository {
	return &relayRepository{
		db:    db,
		redis: redis,
	}
}

func (r *relayRepository) RecordScoreHistory(ctx context.Context, history *domain.RelayScoreHistory) error {
	query := `
		INSERT INTO relay_score_history (
			courier_id, score_before, score_after, change_reason, 
			order_id, admin_id, admin_note, tier_before, tier_after
		) VALUES (
			:courier_id, :score_before, :score_after, :change_reason, 
			:order_id, :admin_id, :admin_note, :tier_before, :tier_after
		) RETURNING id, calculated_at
	`

	stmt, err := r.db.PrepareNamedContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare named stmt for RecordScoreHistory: %w", err)
	}
	defer stmt.Close()

	err = stmt.GetContext(ctx, history, history)
	if err != nil {
		return fmt.Errorf("failed to execute RecordScoreHistory: %w", err)
	}

	return nil
}

func (r *relayRepository) GetScoreHistory(ctx context.Context, courierID uuid.UUID, limit int) ([]domain.RelayScoreHistory, error) {
	var histories []domain.RelayScoreHistory
	query := `
		SELECT * FROM relay_score_history 
		WHERE courier_id = $1 
		ORDER BY calculated_at DESC 
		LIMIT $2
	`

	err := r.db.SelectContext(ctx, &histories, query, courierID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get score history: %w", err)
	}

	return histories, nil
}

// GetCourierPerformanceStats fetches real performance metrics from courier_profiles
// for relay score calculation. This replaces hardcoded mock values.
func (r *relayRepository) GetCourierPerformanceStats(ctx context.Context, courierID uuid.UUID) (*domain.CourierPerformanceStats, error) {
	var stats domain.CourierPerformanceStats
	query := `
		SELECT 
			cp.id,
			COALESCE(u.full_name, 'Courier ' || LEFT(cp.id::text, 8)) AS courier_name,
			COALESCE(cp.ontime_deliveries_count, 0)   AS ontime_deliveries_count,
			COALESCE(cp.total_deliveries_count, 0)    AS total_deliveries_count,
			COALESCE(cp.docs_complete_pct, 100.0)     AS docs_complete_pct,
			COALESCE(cp.avg_partner_rating, 5.00)     AS avg_partner_rating,
			COALESCE(cp.complaint_ratio_pct, 0.0)     AS complaint_ratio_pct,
			COALESCE(cp.relay_score, 5.00)            AS relay_score,
			COALESCE(cp.tier, 'standart')             AS tier
		FROM courier_profiles cp
		LEFT JOIN users u ON cp.user_id = u.id OR cp.id = u.id
		WHERE cp.id = $1
	`

	if err := r.db.GetContext(ctx, &stats, query, courierID); err != nil {
		return nil, fmt.Errorf("failed to fetch performance stats for courier %s: %w", courierID, err)
	}

	return &stats, nil
}

func (r *relayRepository) GetCourierDispatchScoreStats(ctx context.Context, courierID uuid.UUID, pickupLat float64, pickupLng float64) (*domain.CourierDispatchScoreStats, error) {
	var stats domain.CourierDispatchScoreStats
	query := `
		SELECT
			cp.id,
			cp.relay_score::float8 AS relay_score,
			cp.acceptance_rate_pct::float8 AS acceptance_rate_pct,
			cp.max_weight_capacity_kg::float8 AS max_weight_capacity_kg,
			cp.max_packages_capacity::int AS max_packages_capacity,
			(u.profile_photo_locked_at IS NOT NULL) AS profile_photo_locked,
			ST_Distance(
				cp.current_location::geography,
				ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
			)::float8 AS distance_meters,
			COALESCE(
				EXTRACT(EPOCH FROM (NOW() - cp.last_location_updated_at)) / 60,
				0
			)::float8 AS idle_minutes,
			COALESCE(cp.avg_courier_rating, 5.0)::float8 AS avg_rating,
			COALESCE(cp.tier, 'standart') AS tier
		FROM courier_profiles cp
		JOIN users u ON cp.user_id = u.id
		WHERE (cp.id = $1 OR cp.user_id = $1)
		  AND cp.is_online = TRUE
		  AND cp.current_location IS NOT NULL
		  AND cp.relay_score IS NOT NULL
		  AND cp.acceptance_rate_pct IS NOT NULL
		LIMIT 1
	`

	if err := r.db.GetContext(ctx, &stats, query, courierID, pickupLat, pickupLng); err != nil {
		return nil, fmt.Errorf("failed to fetch dispatch score stats for courier %s: %w", courierID, err)
	}
	if stats.DistanceMeters < 0 {
		return nil, fmt.Errorf("invalid dispatch distance for courier %s", courierID)
	}

	return &stats, nil
}

// UpdateCourierRelayScore persists the newly calculated score and tier to courier_profiles.
func (r *relayRepository) UpdateCourierRelayScore(ctx context.Context, courierID uuid.UUID, newScore float64, newTier string) error {
	query := `
		UPDATE courier_profiles
		SET 
			relay_score              = $1,
			tier                     = $2,
			last_score_calculated_at = NOW(),
			updated_at               = NOW()
		WHERE id = $3
	`

	result, err := r.db.ExecContext(ctx, query, newScore, newTier, courierID)
	if err != nil {
		return fmt.Errorf("failed to update relay score for courier %s: %w", courierID, err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected for relay score update: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("courier %s not found in courier_profiles — relay score not updated", courierID)
	}

	return nil
}

func (r *relayRepository) UpdateCourierTier(ctx context.Context, courierID uuid.UUID, newTier string) error {
	query := `
		UPDATE courier_profiles
		SET tier = $1,
			updated_at = NOW()
		WHERE id = $2
	`

	result, err := r.db.ExecContext(ctx, query, newTier, courierID)
	if err != nil {
		return fmt.Errorf("failed to update courier tier: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no courier profile found for ID %s", courierID.String())
	}

	return nil
}

// GetCourierBankInfo fetches bank account details for payout disbursement.
// Returns nil fields when bank info has not been completed by the courier.
func (r *relayRepository) GetCourierBankInfo(ctx context.Context, courierID uuid.UUID) (*domain.CourierBankInfo, error) {
	var info domain.CourierBankInfo
	query := `
		SELECT 
			id,
			bank_code,
			bank_account_number,
			bank_account_name
		FROM courier_profiles
		WHERE id = $1
	`

	if err := r.db.GetContext(ctx, &info, query, courierID); err != nil {
		return nil, fmt.Errorf("failed to fetch bank info for courier %s: %w", courierID, err)
	}

	return &info, nil
}

// GetCourierIDForOrderLeg returns the courier_id assigned to the given order_leg.
// Used by CalculateOrderLegPayout to resolve the correct courier.
func (r *relayRepository) GetCourierIDForOrderLeg(ctx context.Context, orderLegID uuid.UUID) (uuid.UUID, error) {
	var courierID uuid.UUID
	query := `
		SELECT courier_id
		FROM order_legs
		WHERE id = $1
	`

	if err := r.db.GetContext(ctx, &courierID, query, orderLegID); err != nil {
		return uuid.Nil, fmt.Errorf("failed to get courier_id for order_leg %s: %w", orderLegID, err)
	}

	return courierID, nil
}

// AcquireMatchLock attempts to acquire a distributed lock in Redis for atomic matching
func (r *relayRepository) AcquireMatchLock(ctx context.Context, orderID uuid.UUID, ttl time.Duration) (bool, error) {
	key := fmt.Sprintf("lock:relay:match:%s", orderID.String())

	// SetNX (SET if Not eXists) is atomic
	success, err := r.redis.SetNX(ctx, key, "locked", ttl).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire match lock from redis: %w", err)
	}

	return success, nil
}

func (r *relayRepository) ReleaseMatchLock(ctx context.Context, orderID uuid.UUID) error {
	key := fmt.Sprintf("lock:relay:match:%s", orderID.String())

	err := r.redis.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to release match lock: %w", err)
	}

	return nil
}

func (r *relayRepository) ListCourierPerformanceStats(ctx context.Context, limit, offset int, search string) ([]*domain.CourierPerformanceStats, error) {
	var query string
	var args []interface{}

	if search != "" {
		query = "SELECT cp.id, COALESCE(u.full_name, 'Courier ' || LEFT(cp.id::text, 8)) as courier_name, cp.ontime_deliveries_count, cp.total_deliveries_count, cp.docs_complete_pct, cp.avg_partner_rating, cp.complaint_ratio_pct, cp.relay_score, cp.tier FROM courier_profiles cp LEFT JOIN users u ON cp.user_id = u.id OR cp.id = u.id WHERE cp.tier ILIKE $1 OR u.full_name ILIKE $1 OR cp.id::text ILIKE $1 LIMIT $2 OFFSET $3"
		args = []interface{}{"%" + search + "%", limit, offset}
	} else {
		query = "SELECT cp.id, COALESCE(u.full_name, 'Courier ' || LEFT(cp.id::text, 8)) as courier_name, cp.ontime_deliveries_count, cp.total_deliveries_count, cp.docs_complete_pct, cp.avg_partner_rating, cp.complaint_ratio_pct, cp.relay_score, cp.tier FROM courier_profiles cp LEFT JOIN users u ON cp.user_id = u.id OR cp.id = u.id LIMIT $1 OFFSET $2"
		args = []interface{}{limit, offset}
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := []*domain.CourierPerformanceStats{}
	for rows.Next() {
		var s domain.CourierPerformanceStats
		if err := rows.Scan(&s.CourierID, &s.CourierName, &s.OntimeDeliveries, &s.TotalDeliveries, &s.DocsCompletePct, &s.AvgPartnerRating, &s.ComplaintRatioPct, &s.RelayScore, &s.Tier); err != nil {
			return nil, err
		}
		stats = append(stats, &s)
	}

	return stats, nil
}
