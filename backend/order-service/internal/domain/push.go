package domain

import (
	"context"

	"github.com/google/uuid"
)

// ============================================================
// FOOD-BIKE-064 — Push Notification (device token + FCM wiring)
// Tabel user_device_tokens (migration 20260806000011):
// merchant/courier/customer register token FCM via POST /api/v1/device-tokens.
// PushService mengirim notifikasi ke merchant saat order food masuk
// (pending_merchant) — SLA 3 menit respon merchant (FOOD-BIKE-022).
// ============================================================

// DeviceTokenRepository — akses user_device_tokens.
type DeviceTokenRepository interface {
	// UpsertDeviceToken menyimpan/memperbarui token per user (UNIQUE user_id, token).
	UpsertDeviceToken(ctx context.Context, userID uuid.UUID, token, platform, appName string) error
	// GetDeviceTokensByUserIDs mengembalikan map[userID][]token aktif.
	GetDeviceTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error)
	// GetMerchantOwnerUserID me-resolve merchants.user_id dari merchant ID.
	GetMerchantOwnerUserID(ctx context.Context, merchantID string) (uuid.UUID, error)
}

// PushService — abstraksi kirim push notification FCM.
type PushService interface {
	// NotifyMerchantNewOrder memberi tahu owner merchant ada order food baru
	// menunggu respon (status pending_merchant). Idempotent per order.
	NotifyMerchantNewOrder(ctx context.Context, orderID string) error
	// NotifyCustomerOrderCancelled (FB-084) memberi tahu customer bahwa
	// ordernya dibatalkan karena KESALAHAN MERCHANT (reject / timeout respon).
	// Message berisi alasan pembatalan. Non-fatal: gagal kirim hanya di-log.
	NotifyCustomerOrderCancelled(ctx context.Context, orderID string, message string) error
	// NotifyCustomerOrderUpdated (FB-087) memberi tahu customer bahwa item
	// ordernya diubah merchant sebelum konfirmasi (nilai tidak boleh naik).
	// Non-fatal: gagal kirim hanya di-log.
	NotifyCustomerOrderUpdated(ctx context.Context, orderID string, message string) error
	// NotifyCustomerMerchantAccepted (FB-124) memberi tahu customer bahwa
	// merchant menerima pesanan food (status preparing).
	NotifyCustomerMerchantAccepted(ctx context.Context, orderID string, message string) error
	// NotifyCustomerDriverAssigned (FB-124) memberi tahu customer bahwa
	// driver sudah di-assign ke order food (status accepted).
	NotifyCustomerDriverAssigned(ctx context.Context, orderID string, message string) error
	// NotifyCustomerPickedUp (FB-124) memberi tahu customer bahwa pesanan
	// food sudah diambil driver dari merchant (status picked_up).
	NotifyCustomerPickedUp(ctx context.Context, orderID string, message string) error
	// NotifyCustomerDelivered (FB-124) memberi tahu customer bahwa pesanan
	// food sudah diantar (status delivered).
	NotifyCustomerDelivered(ctx context.Context, orderID string, message string) error
	// NotifyMerchantPickedUp (FB-124) memberi tahu merchant bahwa driver
	// sudah mengambil pesanan (konfirmasi serah terima, status picked_up).
	NotifyMerchantPickedUp(ctx context.Context, orderID string, message string) error
	// NotifyMerchantDelivered (FB-124) memberi tahu merchant bahwa pesanan
	// sudah diantar ke customer (status delivered).
	NotifyMerchantDelivered(ctx context.Context, orderID string, message string) error
}
