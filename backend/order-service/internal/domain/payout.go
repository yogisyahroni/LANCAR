package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// PayoutStatus defines the state of a payout
type PayoutStatus string

const (
	PayoutStatusPending    PayoutStatus = "pending"
	PayoutStatusProcessing PayoutStatus = "processing"
	PayoutStatusCompleted  PayoutStatus = "completed"
	PayoutStatusFailed     PayoutStatus = "failed"
)

// PayoutType defines the type of payout
type PayoutType string

const (
	PayoutTypeLegFee           PayoutType = "leg_fee"
	PayoutTypeIdleCompensation PayoutType = "idle_compensation"
	PayoutTypeBonus            PayoutType = "bonus"
	PayoutTypePenalty          PayoutType = "penalty"
)

// PayoutRecord represents a single earnings or deduction record for a courier
type PayoutRecord struct {
	ID                    uuid.UUID    `json:"id" db:"id"`
	CourierID             uuid.UUID    `json:"courier_id" db:"courier_id"`
	OrderLegID            *uuid.UUID   `json:"order_leg_id,omitempty" db:"order_leg_id"`
	OrderID               *uuid.UUID   `json:"order_id,omitempty" db:"order_id"`
	Type                  PayoutType   `json:"type" db:"type"`
	Currency              string       `json:"currency" db:"currency_code"`
	CurrencyMinorUnit     int          `json:"currency_minor_unit" db:"currency_minor_unit"`
	GrossMinor            int64        `json:"gross_minor" db:"gross_minor"`
	PenaltyMinor          int64        `json:"penalty_minor" db:"penalty_minor"`
	IdleCompensationMinor int64        `json:"idle_compensation_minor" db:"idle_compensation_minor"`
	NetMinor              int64        `json:"net_minor" db:"net_minor"`
	PPh21Minor            int64        `json:"pph21_minor" db:"pph21_minor"`
	GrossIDR              int          `json:"gross_idr" db:"gross_idr"`
	PenaltyIDR            int          `json:"penalty_idr" db:"penalty_idr"`
	IdleCompensationIDR   int          `json:"idle_compensation_idr" db:"idle_compensation_idr"`
	NetIDR                int          `json:"net_idr" db:"net_idr"`
	PPh21IDR              int          `json:"pph21_idr" db:"pph21_idr"`
	DisbursementStatus    PayoutStatus `json:"disbursement_status" db:"disbursement_status"`
	DisbursementRef       *string      `json:"disbursement_ref,omitempty" db:"disbursement_ref"`
	DisbursementAt        *time.Time   `json:"disbursement_at,omitempty" db:"disbursement_at"`
	FailureReason         *string      `json:"failure_reason,omitempty" db:"failure_reason"`
	RetryCount            int          `json:"retry_count" db:"retry_count"`
	BatchDate             *time.Time   `json:"batch_date,omitempty" db:"batch_date"`
	CreatedAt             time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time    `json:"updated_at" db:"updated_at"`
}

// CourierEarningsSummary represents the summarized earnings for a courier
type CourierEarningsSummary struct {
	CourierID          uuid.UUID `json:"courier_id"`
	TotalGrossIDR      int       `json:"total_gross_idr"`
	TotalPenaltyIDR    int       `json:"total_penalty_idr"`
	TotalIdleCompIDR   int       `json:"total_idle_comp_idr"`
	TotalNetIDR        int       `json:"total_net_idr"`
	TotalPPh21IDR      int       `json:"total_pph21_idr"`
	TotalPayoutIDR     int       `json:"total_payout_idr"` // net - pph21
	PendingPayoutIDR   int       `json:"pending_payout_idr"`
	Currency           string    `json:"currency"`
	CurrencyMinorUnit  int       `json:"currency_minor_unit"`
	TotalGrossMinor    int64     `json:"total_gross_minor"`
	TotalPenaltyMinor  int64     `json:"total_penalty_minor"`
	TotalIdleCompMinor int64     `json:"total_idle_comp_minor"`
	TotalNetMinor      int64     `json:"total_net_minor"`
	TotalPPh21Minor    int64     `json:"total_pph21_minor"`
	TotalPayoutMinor   int64     `json:"total_payout_minor"`
	PendingPayoutMinor int64     `json:"pending_payout_minor"`
}

// PayoutRepository handles database operations for payouts
type PayoutRepository interface {
	CreatePayout(ctx context.Context, record *PayoutRecord) error
	GetByOrderLegID(ctx context.Context, orderLegID uuid.UUID) (*PayoutRecord, error)
	UpdatePayoutStatus(ctx context.Context, id uuid.UUID, status PayoutStatus, ref *string, errReason *string) error
	GetPendingPayoutsByCourier(ctx context.Context, courierID uuid.UUID) ([]PayoutRecord, error)
	GetEarningsSummary(ctx context.Context, courierID uuid.UUID, from, to time.Time) (*CourierEarningsSummary, error)
	GetAllPendingPayouts(ctx context.Context) ([]PayoutRecord, error)
}

// PayoutGateway handles integration with third-party disbursement APIs (e.g. Xendit/Flip)
type PayoutGateway interface {
	Disburse(ctx context.Context, amount int, courierBankCode, courierBankAccount, description string) (refID string, err error)
}

// MoneyPayoutGateway is the currency-aware disbursement extension. The
// legacy gateway remains valid for IDR only; callers must not pass USD/EUR
// minor units through its integer-IDR method.
type MoneyPayoutGateway interface {
	DisburseMoney(ctx context.Context, amount Money, courierBankCode, courierBankAccount, description string) (refID string, err error)
}

// PayoutService provides business logic for payouts
type PayoutService interface {
	CalculateOrderLegPayout(ctx context.Context, orderLegID uuid.UUID, fee int, penalty int, idleComp int) (*PayoutRecord, error)
	TriggerBatchPayout(ctx context.Context) error
	GetCourierEarnings(ctx context.Context, courierID uuid.UUID, period string) (*CourierEarningsSummary, error)
}
