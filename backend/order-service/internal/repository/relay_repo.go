package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/redis/go-redis/v9"
	"lancar/order-service/internal/domain"
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
