package domain

import "context"

// MerchantOrderRepository — akses order food milik merchant + transisi status.
// Semua service LANCAR share DB tembus, jadi merchant-service membaca/meng-update
// tabel orders langsung (konsisten dengan payment-service yang akses wallets).
type MerchantOrderRepository interface {
	// AcceptOrder: status pending_merchant → preparing, set merchant_accepted_at.
	AcceptOrder(ctx context.Context, merchantID, orderID string) error
	// RejectOrder: status pending_merchant → cancelled_by_merchant + reason.
	RejectOrder(ctx context.Context, merchantID, orderID, reason string) error
	// ListByMerchant list order food merchant (dengan items), filter status.
	ListByMerchant(ctx context.Context, merchantID, status string, limit, offset int) ([]*MerchantOrderView, error)
	// CountByMerchant total order merchant untuk filter status.
	CountByMerchant(ctx context.Context, merchantID, status string) (int, error)
}
