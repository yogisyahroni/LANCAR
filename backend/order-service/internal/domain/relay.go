package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type RelayScoreHistory struct {
	ID           uuid.UUID  `json:"id" db:"id"`
	CourierID    uuid.UUID  `json:"courier_id" db:"courier_id"`
	ScoreBefore  float64    `json:"score_before" db:"score_before"`
	ScoreAfter   float64    `json:"score_after" db:"score_after"`
	ChangeReason string     `json:"change_reason" db:"change_reason"` // 'order_completed', 'sla_breach', 'admin_override', 'complaint'
	OrderID      *uuid.UUID `json:"order_id" db:"order_id"`
	AdminID      *uuid.UUID `json:"admin_id" db:"admin_id"`
	AdminNote    *string    `json:"admin_note" db:"admin_note"`
	TierBefore   *string    `json:"tier_before" db:"tier_before"`
	TierAfter    *string    `json:"tier_after" db:"tier_after"`
	CalculatedAt time.Time  `json:"calculated_at" db:"calculated_at"`
}

// CourierPerformanceStats holds real-time performance metrics fetched from courier_profiles.
// These are updated by analytics workers and used in relay score calculation.
type CourierPerformanceStats struct {
	CourierID         uuid.UUID `db:"id"`
	OntimeDeliveries  int       `db:"ontime_deliveries_count"`
	TotalDeliveries   int       `db:"total_deliveries_count"`
	DocsCompletePct   float64   `db:"docs_complete_pct"`
	AvgPartnerRating  float64   `db:"avg_partner_rating"`
	ComplaintRatioPct float64   `db:"complaint_ratio_pct"`
	RelayScore        float64   `db:"relay_score"`
	Tier              string    `db:"tier"`
}

// CourierDispatchScoreStats holds the runtime metrics required to rank a courier
// for a specific pickup point. All values are read from operational DB state.
type CourierDispatchScoreStats struct {
	CourierID           uuid.UUID `db:"id"`
	RelayScore          float64   `db:"relay_score"`
	AcceptanceRatePct   float64   `db:"acceptance_rate_pct"`
	DistanceMeters      float64   `db:"distance_meters"`
	MaxWeightCapacityKg *float64  `db:"max_weight_capacity_kg"`
	MaxPackagesCapacity *int      `db:"max_packages_capacity"`
}

// CourierBankInfo holds bank account info needed for payout disbursement.
type CourierBankInfo struct {
	CourierID         uuid.UUID `db:"id"`
	BankCode          *string   `db:"bank_code"`
	BankAccountNumber *string   `db:"bank_account_number"`
	BankAccountName   *string   `db:"bank_account_name"`
}

type RelayMatch struct {
	OrderID    uuid.UUID
	CourierIDs []uuid.UUID
	MatchTime  time.Time
	TargetETAs []time.Time
}

type RelayRepository interface {
	RecordScoreHistory(ctx context.Context, history *RelayScoreHistory) error
	GetScoreHistory(ctx context.Context, courierID uuid.UUID, limit int) ([]RelayScoreHistory, error)

	// GetCourierPerformanceStats fetches real performance metrics from courier_profiles
	// for accurate relay score calculation.
	GetCourierPerformanceStats(ctx context.Context, courierID uuid.UUID) (*CourierPerformanceStats, error)

	// GetCourierDispatchScoreStats fetches DB-backed score, acceptance, and proximity
	// metrics for matching. Missing profile/location data must fail closed.
	GetCourierDispatchScoreStats(ctx context.Context, courierID uuid.UUID, pickupLat float64, pickupLng float64) (*CourierDispatchScoreStats, error)

	// UpdateCourierRelayScore persists the newly calculated score and tier to courier_profiles.
	UpdateCourierRelayScore(ctx context.Context, courierID uuid.UUID, newScore float64, newTier string) error

	// GetCourierBankInfo fetches bank account details for payout disbursement.
	GetCourierBankInfo(ctx context.Context, courierID uuid.UUID) (*CourierBankInfo, error)

	// GetCourierIDForOrderLeg returns the courier_id assigned to a given order_leg.
	GetCourierIDForOrderLeg(ctx context.Context, orderLegID uuid.UUID) (uuid.UUID, error)

	// Distributed lock for atomic 3-courier matching
	AcquireMatchLock(ctx context.Context, orderID uuid.UUID, ttl time.Duration) (bool, error)
	ReleaseMatchLock(ctx context.Context, orderID uuid.UUID) error
}

type RelayScoreService interface {
	CalculateScore(ctx context.Context, courierID uuid.UUID, reason string, orderID *uuid.UUID) error
	AdminOverrideScore(ctx context.Context, courierID uuid.UUID, newScore float64, adminID uuid.UUID, note string) error
	CheckTierPromotion(ctx context.Context, courierID uuid.UUID, currentScore float64) (newTier string, changed bool)
}
