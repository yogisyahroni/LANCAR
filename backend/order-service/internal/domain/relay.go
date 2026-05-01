package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type RelayScoreHistory struct {
	ID           uuid.UUID `json:"id" db:"id"`
	CourierID    uuid.UUID `json:"courier_id" db:"courier_id"`
	ScoreBefore  float64   `json:"score_before" db:"score_before"`
	ScoreAfter   float64   `json:"score_after" db:"score_after"`
	ChangeReason string    `json:"change_reason" db:"change_reason"` // 'order_completed', 'sla_breach', 'admin_override', 'complaint'
	OrderID      *uuid.UUID `json:"order_id" db:"order_id"`
	AdminID      *uuid.UUID `json:"admin_id" db:"admin_id"`
	AdminNote    *string   `json:"admin_note" db:"admin_note"`
	TierBefore   *string   `json:"tier_before" db:"tier_before"`
	TierAfter    *string   `json:"tier_after" db:"tier_after"`
	CalculatedAt time.Time `json:"calculated_at" db:"calculated_at"`
}

type RelayMatch struct {
	OrderID     uuid.UUID
	CourierIDs  []uuid.UUID
	MatchTime   time.Time
	TargetETAs  []time.Time
}

type RelayRepository interface {
	RecordScoreHistory(ctx context.Context, history *RelayScoreHistory) error
	GetScoreHistory(ctx context.Context, courierID uuid.UUID, limit int) ([]RelayScoreHistory, error)
	
	// Distributed lock for atomic 3-courier matching
	AcquireMatchLock(ctx context.Context, orderID uuid.UUID, ttl time.Duration) (bool, error)
	ReleaseMatchLock(ctx context.Context, orderID uuid.UUID) error
}

type RelayScoreService interface {
	CalculateScore(ctx context.Context, courierID uuid.UUID, reason string, orderID *uuid.UUID) error
	AdminOverrideScore(ctx context.Context, courierID uuid.UUID, newScore float64, adminID uuid.UUID, note string) error
	CheckTierPromotion(ctx context.Context, courierID uuid.UUID, currentScore float64) (newTier string, changed bool)
}
