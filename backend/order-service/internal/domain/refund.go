package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type RefundStatus string

const (
	RefundStatusPending   RefundStatus = "pending"
	RefundStatusProcessed RefundStatus = "processed"
	RefundStatusFailed    RefundStatus = "failed"
)

type RefundRecord struct {
	ID            uuid.UUID    `json:"id" db:"id"`
	OrderID       uuid.UUID    `json:"order_id" db:"order_id"`
	AmountIDR     int          `json:"amount_idr" db:"amount_idr"`
	Reason        string       `json:"reason" db:"reason"`
	Status        RefundStatus `json:"status" db:"status"`
	GatewayRef    *string      `json:"gateway_ref,omitempty" db:"gateway_ref"`
	FailureReason *string      `json:"failure_reason,omitempty" db:"failure_reason"`
	CreatedAt     time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at" db:"updated_at"`
}

type RefundRepository interface {
	CreateRefund(ctx context.Context, record *RefundRecord) error
	UpdateRefundStatus(ctx context.Context, id uuid.UUID, status RefundStatus, ref *string, errReason *string) error
	GetRefundsByOrder(ctx context.Context, orderID uuid.UUID) ([]RefundRecord, error)
	GetPendingRefunds(ctx context.Context) ([]RefundRecord, error)
}

type RefundGateway interface {
	ProcessRefund(ctx context.Context, paymentRef string, amount int, reason string) (string, error)
}

type RefundService interface {
	CalculateAndTriggerRefund(ctx context.Context, orderID uuid.UUID, cancelReason string) (*RefundRecord, error)
	ProcessPendingRefunds(ctx context.Context) error
}
