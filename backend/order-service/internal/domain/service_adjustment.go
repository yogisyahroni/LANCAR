package domain

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var (
	ErrInvalidServiceAdjustment             = errors.New("invalid service adjustment")
	ErrServiceAdjustmentForbidden           = errors.New("service adjustment forbidden")
	ErrServiceAdjustmentNotFound            = errors.New("service adjustment not found")
	ErrServiceAdjustmentConflict            = errors.New("service adjustment conflict")
	ErrServiceAdjustmentStale               = errors.New("service adjustment stale")
	ErrServiceAdjustmentMissingQuote        = errors.New("service adjustment initial quote missing")
	ErrServiceAdjustmentIdempotencyConflict = errors.New("service adjustment idempotency conflict")
)

const (
	ServiceAdjustmentStatusPending  = "pending"
	ServiceAdjustmentStatusApproved = "approved"
	ServiceAdjustmentStatusRejected = "rejected"

	ServiceAdjustmentFinancialNotDue            = "not_due"
	ServiceAdjustmentFinancialPendingCollection = "pending_collection"
	ServiceAdjustmentFinancialCollected         = "collected"
	ServiceAdjustmentFinancialWaived            = "waived"
	ServiceAdjustmentFinancialReversed           = "reversed"

	ServiceAdjustmentItemMaterial = "material"
	ServiceAdjustmentItemLabor    = "labor"
)

type ServiceAdjustmentItem struct {
	Code         string `json:"code"`
	Label        string `json:"label"`
	Type         string `json:"type"`
	Quantity     int64  `json:"quantity"`
	UnitPriceIDR int64  `json:"unit_price_idr"`
	TotalIDR     int64  `json:"total_idr"`
}

type ServiceAdjustment struct {
	ID                     string                  `json:"id" db:"id"`
	OrderID                string                  `json:"order_id" db:"order_id"`
	CustomerID             string                  `json:"customer_id" db:"customer_id"`
	RequestedByCourierID   string                  `json:"requested_by_courier_id" db:"requested_by_courier_id"`
	ServiceCategory        string                  `json:"service_category" db:"service_category"`
	ServiceCode            string                  `json:"service_code,omitempty" db:"service_code"`
	ServiceSubType         string                  `json:"service_sub_type,omitempty" db:"service_sub_type"`
	Reason                 string                  `json:"reason" db:"reason"`
	Items                  []ServiceAdjustmentItem `json:"items" db:"-"`
	InitialQuoteID         string                  `json:"initial_quote_id" db:"initial_quote_id"`
	InitialPricingSnapshot json.RawMessage         `json:"initial_pricing_snapshot" db:"initial_pricing_snapshot"`
	OriginalTotalIDR       int64                   `json:"original_total_idr" db:"original_total_idr"`
	DeltaIDR               int64                   `json:"delta_idr" db:"delta_idr"`
	ProposedTotalIDR       int64                   `json:"proposed_total_idr" db:"proposed_total_idr"`
	ApprovedDeltaIDR       int64                   `json:"approved_delta_idr" db:"approved_delta_idr"`
	Status                 string                  `json:"status" db:"status"`
	FinancialState         string                  `json:"financial_state" db:"financial_state"`
	ApprovedByCustomerID   *string                 `json:"approved_by_customer_id,omitempty" db:"approved_by_customer_id"`
	ApprovedAt             *time.Time              `json:"approved_at,omitempty" db:"approved_at"`
	RejectedByCustomerID   *string                 `json:"rejected_by_customer_id,omitempty" db:"rejected_by_customer_id"`
	RejectedAt             *time.Time              `json:"rejected_at,omitempty" db:"rejected_at"`
	RejectionReason        *string                 `json:"rejection_reason,omitempty" db:"rejection_reason"`
	CorrelationID          string                  `json:"correlation_id,omitempty" db:"correlation_id"`
	CreatedAt              time.Time               `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time               `json:"updated_at" db:"updated_at"`
}

type ProposeServiceAdjustmentRequest struct {
	OrderID            string                  `json:"order_id"`
	Reason             string                  `json:"reason"`
	Items              []ServiceAdjustmentItem `json:"items"`
	IdempotencyKey     string                  `json:"-"`
	RequestFingerprint string                  `json:"-"`
	CorrelationID      string                  `json:"-"`
}

type DecideServiceAdjustmentRequest struct {
	AdjustmentID       string `json:"adjustment_id"`
	Decision           string `json:"decision"`
	RejectionReason    string `json:"rejection_reason,omitempty"`
	IdempotencyKey     string `json:"-"`
	RequestFingerprint string `json:"-"`
	CorrelationID      string `json:"-"`
}

type ServiceAdjustmentRepository interface {
	Propose(ctx context.Context, req *ProposeServiceAdjustmentRequest, courierID string, deltaIDR int64) (*ServiceAdjustment, error)
	ListForCustomer(ctx context.Context, orderID, customerID string) ([]ServiceAdjustment, error)
	Decide(ctx context.Context, req *DecideServiceAdjustmentRequest, customerID string) (*ServiceAdjustment, error)
}

type ServiceAdjustmentService interface {
	Propose(ctx context.Context, req *ProposeServiceAdjustmentRequest, courierID string) (*ServiceAdjustment, error)
	ListForCustomer(ctx context.Context, orderID, customerID string) ([]ServiceAdjustment, error)
	Decide(ctx context.Context, req *DecideServiceAdjustmentRequest, customerID string) (*ServiceAdjustment, error)
}
