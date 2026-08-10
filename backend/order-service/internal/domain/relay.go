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
	CourierID         uuid.UUID `json:"courier_id" db:"id"`
	CourierName       string    `json:"courier_name" db:"courier_name"`
	OntimeDeliveries  int       `json:"ontime_deliveries_count" db:"ontime_deliveries_count"`
	TotalDeliveries   int       `json:"total_deliveries_count" db:"total_deliveries_count"`
	DocsCompletePct   float64   `json:"docs_complete_pct" db:"docs_complete_pct"`
	AvgPartnerRating  float64   `json:"avg_partner_rating" db:"avg_partner_rating"`
	ComplaintRatioPct float64   `json:"complaint_ratio_pct" db:"complaint_ratio_pct"`
	RelayScore        float64   `json:"relay_score" db:"relay_score"`
	Tier              string    `json:"tier" db:"tier"`
	// FB-116: feedback rating terbaru dari customer (dengan komentar).
	RecentRatings []CourierRatingComment `json:"recent_ratings,omitempty"`
}

// CourierRatingComment — satu feedback rating driver (FB-116).
type CourierRatingComment struct {
	Stars     int       `json:"stars" db:"stars"`
	Comment   string    `json:"comment" db:"comment"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// CourierDispatchScoreStats holds the runtime metrics required to rank a courier
// for a specific pickup point. All values are read from operational DB state.
type CourierDispatchScoreStats struct {
	CourierID           uuid.UUID `json:"courier_id" db:"id"`
	RelayScore          float64   `json:"relay_score" db:"relay_score"`
	AcceptanceRatePct   float64   `json:"acceptance_rate_pct" db:"acceptance_rate_pct"`
	DistanceMeters      float64   `json:"distance_meters" db:"distance_meters"`
	MaxWeightCapacityKg *float64  `json:"max_weight_capacity_kg" db:"max_weight_capacity_kg"`
	MaxPackagesCapacity *int      `json:"max_packages_capacity" db:"max_packages_capacity"`
	ProfilePhotoLocked  bool      `json:"profile_photo_locked" db:"profile_photo_locked"`
	// S3-OS-01: Idle time & rating for fairness scoring
	IdleMinutes float64 `json:"idle_minutes" db:"idle_minutes"`
	AvgRating   float64 `json:"avg_rating" db:"avg_rating"`
	Tier        string  `json:"tier" db:"tier"`
}

// CourierBankInfo holds bank account info needed for payout disbursement.
type CourierBankInfo struct {
	CourierID         uuid.UUID `json:"courier_id" db:"id"`
	BankCode          *string   `json:"bank_code" db:"bank_code"`
	BankAccountNumber *string   `json:"bank_account_number" db:"bank_account_number"`
	BankAccountName   *string   `json:"bank_account_name" db:"bank_account_name"`
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
	ListCourierPerformanceStats(ctx context.Context, limit, offset int, search string) ([]*CourierPerformanceStats, error)

	// GetCourierDispatchScoreStats fetches DB-backed score, acceptance, and proximity
	// metrics for matching. Missing profile/location data must fail closed.
	GetCourierDispatchScoreStats(ctx context.Context, courierID uuid.UUID, pickupLat float64, pickupLng float64) (*CourierDispatchScoreStats, error)

	// UpdateCourierRelayScore persists the newly calculated score and tier to courier_profiles.
	UpdateCourierRelayScore(ctx context.Context, courierID uuid.UUID, newScore float64, newTier string) error
	UpdateCourierTier(ctx context.Context, courierID uuid.UUID, newTier string) error

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
	AdminOverrideTier(ctx context.Context, courierID uuid.UUID, newTier string, adminID uuid.UUID, note string) error
	CheckTierPromotion(ctx context.Context, courierID uuid.UUID, currentScore float64) (newTier string, changed bool)
	ListCourierPerformanceStats(ctx context.Context, limit, offset int, search string) ([]*CourierPerformanceStats, error)
}
