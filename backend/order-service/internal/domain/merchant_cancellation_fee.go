package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// MerchantCancellationFeeStatus — lifecycle piutang cancellation fee merchant.
// PENDING → DEDUCTED (dipotong dari settlement merchant berikutnya).
type MerchantCancellationFeeStatus string

const (
	CancellationFeePending  MerchantCancellationFeeStatus = "PENDING"
	CancellationFeeDeducted MerchantCancellationFeeStatus = "DEDUCTED"
)

// MerchantCancellationFee — FB-082: biaya pembatalan yang di-charge ke merchant
// saat order batal karena KESALAHAN MERCHANT (reject / timeout / gagal siap).
// Customer tetap refund 100%; platform fee menjadi piutang merchant yang
// dipotong dari NetPayout settlement merchant berikutnya (order delivered).
type MerchantCancellationFee struct {
	ID                       uuid.UUID                   `json:"id" db:"id"`
	MerchantID               string                      `json:"merchant_id" db:"merchant_id"`
	OrderID                  string                      `json:"order_id" db:"order_id"`
	AmountIDR                int64                       `json:"amount_idr" db:"amount_idr"`
	Reason                   string                      `json:"reason" db:"reason"`
	Status                   MerchantCancellationFeeStatus `json:"status" db:"status"`
	DeductedFromSettlementID *uuid.UUID                  `json:"deducted_from_settlement_id,omitempty" db:"deducted_from_settlement_id"`
	CreatedAt                time.Time                   `json:"created_at" db:"created_at"`
	DeductedAt               *time.Time                  `json:"deducted_at,omitempty" db:"deducted_at"`
}

// MerchantCancellationFeeRepository — akses piutang cancellation fee merchant.
type MerchantCancellationFeeRepository interface {
	// Create mencatat piutang baru (UNIQUE per order — idempotent).
	Create(ctx context.Context, fee *MerchantCancellationFee) error
	// GetOutstandingByMerchant mengambil semua piutang PENDING merchant
	// (dipotong saat settlement berikutnya dibuat).
	GetOutstandingByMerchant(ctx context.Context, merchantID string) ([]*MerchantCancellationFee, error)
	// MarkDeducted menandai fee lunas setelah dipotong dari settlement.
	MarkDeducted(ctx context.Context, id uuid.UUID, settlementID uuid.UUID) error
}
