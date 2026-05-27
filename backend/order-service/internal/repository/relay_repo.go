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
			id,
			COALESCE(ontime_deliveries_count, 0)   AS ontime_deliveries_count,
			COALESCE(total_deliveries_count, 0)    AS total_deliveries_count,
			COALESCE(docs_complete_pct, 100.0)     AS docs_complete_pct,
			COALESCE(avg_partner_rating, 5.00)     AS avg_partner_rating,
			COALESCE(complaint_ratio_pct, 0.0)     AS complaint_ratio_pct,
			COALESCE(relay_score, 5.00)            AS relay_score,
			COALESCE(tier, 'regular')              AS tier
		FROM courier_profiles
		WHERE id = $1
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
			id,
			relay_score::float8 AS relay_score,
			acceptance_rate_pct::float8 AS acceptance_rate_pct,
			ST_Distance(
				current_location::geography,
				ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
			)::float8 AS distance_meters
		FROM courier_profiles
		WHERE (id = $1 OR user_id = $1)
		  AND is_online = TRUE
		  AND current_location IS NOT NULL
		  AND relay_score IS NOT NULL
		  AND acceptance_rate_pct IS NOT NULL
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
