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
	ID                     uuid.UUID    `json:"id" db:"id"`
	OrderID                uuid.UUID    `json:"order_id" db:"order_id"`
	AmountIDR              int          `json:"amount_idr" db:"amount_idr"`
	Reason                 string       `json:"reason" db:"reason"`
	Status                 RefundStatus `json:"status" db:"status"`
	RefundPercentage       int          `json:"refund_percentage" db:"refund_percentage"`
	TaxReversalIDR         int64        `json:"tax_reversal_idr" db:"tax_reversal_idr"`
	PlatformFeeReversalIDR int64        `json:"platform_fee_reversal_idr" db:"platform_fee_reversal_idr"`
	LedgerJournalID        *uuid.UUID   `json:"ledger_journal_id,omitempty" db:"ledger_journal_id"`
	GatewayRef             *string      `json:"gateway_ref,omitempty" db:"gateway_ref"`
	FailureReason          *string      `json:"failure_reason,omitempty" db:"failure_reason"`
	CreatedAt              time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time    `json:"updated_at" db:"updated_at"`
}

type RefundRepository interface {
	CreateRefund(ctx context.Context, record *RefundRecord) error
	UpdateRefundStatus(ctx context.Context, id uuid.UUID, status RefundStatus, ref *string, errReason *string) error
	GetRefundsByOrder(ctx context.Context, orderID uuid.UUID) ([]RefundRecord, error)
	GetPendingRefunds(ctx context.Context) ([]RefundRecord, error)
}

type RefundGateway interface {
	ProcessRefund(ctx context.Context, orderID string, paymentRef string, amount int, reason string) (string, error)
}

// RefundOptions — parameter tambahan kalkulasi refund (FB-079).
// OriginalStatus: status order SEBELUM diubah ke cancelled. Wajib dikirim
// dari cancel flow karena order sudah berstatus cancelled saat refund
// diproses — tanpa ini refund selalu dihitung sebagai 100% (bug).
type RefundOptions struct {
	OriginalStatus OrderStatus
}

// ItemRefundRequest — satu baris item untuk refund partial per item (FB-080).
// Refund dihitung dari snapshot food_order_items (harga beku saat order).
type ItemRefundRequest struct {
	MenuItemID string `json:"menu_item_id" validate:"required"`
	Quantity   int    `json:"quantity" validate:"required,min=1"`
	Reason     string `json:"reason,omitempty"`
}

// RefundItemOptions — opsi tambahan untuk refund partial per item.
type RefundItemOptions struct {
	// IncludeDeliveryFee: true hanya jika kesalahan driver/platform
	// (spec FB-080: ongkir tidak direfund kecuali kesalahan driver/platform).
	IncludeDeliveryFee bool
}

type RefundService interface {
	CalculateAndTriggerRefund(ctx context.Context, orderID uuid.UUID, cancelReason string, opts RefundOptions) (*RefundRecord, error)
	// CalculateItemRefund — refund partial per item food (FB-080):
	// refund = Σ(snapshot item_price × qty), ongkir opsional.
	CalculateItemRefund(ctx context.Context, orderID uuid.UUID, items []ItemRefundRequest, opts RefundItemOptions) (*RefundRecord, error)
	ProcessPendingRefunds(ctx context.Context) error
}
