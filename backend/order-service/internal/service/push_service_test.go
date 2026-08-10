package service_test

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"

	"github.com/google/uuid"
)

// mockDeviceTokenRepo — mock DeviceTokenRepository untuk test push service.
type mockDeviceTokenRepo struct {
	tokensByUser map[uuid.UUID][]string
	merchantOwner uuid.UUID
	merchantErr   error
}

func (m *mockDeviceTokenRepo) UpsertDeviceToken(ctx context.Context, userID uuid.UUID, token, platform, appName string) error {
	return nil
}

func (m *mockDeviceTokenRepo) GetDeviceTokensByUserIDs(ctx context.Context, userIDs []uuid.UUID) (map[uuid.UUID][]string, error) {
	out := make(map[uuid.UUID][]string, len(userIDs))
	for _, id := range userIDs {
		if tokens, ok := m.tokensByUser[id]; ok {
			out[id] = tokens
		}
	}
	return out, nil
}

func (m *mockDeviceTokenRepo) GetMerchantOwnerUserID(ctx context.Context, merchantID string) (uuid.UUID, error) {
	if m.merchantErr != nil {
		return uuid.Nil, m.merchantErr
	}
	return m.merchantOwner, nil
}

// TestPushService_NotifyCustomerOrderCancelled_NoDevice — order ada, customer
// tidak punya device token → no-op sukses (tidak perlu FCM provider).
func TestPushService_NotifyCustomerOrderCancelled_NoDevice(t *testing.T) {
	customerID := uuid.New()
	order := &domain.Order{
		ID:          uuid.NewString(),
		OrderNumber: "FB-20260807-001",
		CustomerID:  customerID.String(),
	}

	svc := service.NewPushService(
		&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}}, // customer tanpa token
		&mockOrderRepo{order: order},
	)

	if err := svc.NotifyCustomerOrderCancelled(context.Background(), order.ID, "Pesanan dibatalkan merchant: stok habis"); err != nil {
		t.Fatalf("expected no-op success, got error: %v", err)
	}
}

// TestPushService_NotifyCustomerOrderCancelled_OrderNotFound — order tidak
// ada → error (bukan silent success).
func TestPushService_NotifyCustomerOrderCancelled_OrderNotFound(t *testing.T) {
	svc := service.NewPushService(
		&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
		&mockOrderRepo{order: nil},
	)

	if err := svc.NotifyCustomerOrderCancelled(context.Background(), uuid.NewString(), "alasan"); err == nil {
		t.Fatal("expected error for missing order, got nil")
	}
}

// TestPushService_NotifyCustomerOrderCancelled_InvalidCustomerID — order
// customer_id bukan UUID → error.
func TestPushService_NotifyCustomerOrderCancelled_InvalidCustomerID(t *testing.T) {
	order := &domain.Order{
		ID:          uuid.NewString(),
		OrderNumber: "FB-20260807-002",
		CustomerID:  "bukan-uuid",
	}

	svc := service.NewPushService(
		&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
		&mockOrderRepo{order: order},
	)

	if err := svc.NotifyCustomerOrderCancelled(context.Background(), order.ID, "alasan"); err == nil {
		t.Fatal("expected error for invalid customer_id, got nil")
	}
}

// ── FB-124: 6 fungsi notif transisi status ──────────────────────────────

// customerNotifCases — daftar method notif customer + pesan default.
func customerNotifCases() []struct {
	name string
	call func(svc domain.PushService, orderID, msg string) error
} {
	return []struct {
		name string
		call func(svc domain.PushService, orderID, msg string) error
	}{
		{"MerchantAccepted", func(svc domain.PushService, id, msg string) error { return svc.NotifyCustomerMerchantAccepted(context.Background(), id, msg) }},
		{"DriverAssigned", func(svc domain.PushService, id, msg string) error { return svc.NotifyCustomerDriverAssigned(context.Background(), id, msg) }},
		{"PickedUp", func(svc domain.PushService, id, msg string) error { return svc.NotifyCustomerPickedUp(context.Background(), id, msg) }},
		{"Delivered", func(svc domain.PushService, id, msg string) error { return svc.NotifyCustomerDelivered(context.Background(), id, msg) }},
	}
}

// TestPushService_FB124_CustomerNotifications_NoDevice — tiap notif customer
// FB-124: order food ada, customer tanpa device token → no-op sukses.
func TestPushService_FB124_CustomerNotifications_NoDevice(t *testing.T) {
	for _, tc := range customerNotifCases() {
		t.Run(tc.name, func(t *testing.T) {
			customerID := uuid.New()
			merchantID := uuid.NewString()
			order := &domain.Order{
				ID:          uuid.NewString(),
				OrderNumber: "FB-20260808-001",
				CustomerID:  customerID.String(),
				MerchantID:  &merchantID,
			}
			svc := service.NewPushService(
				&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
				&mockOrderRepo{order: order},
			)
			if err := tc.call(svc, order.ID, "pesan"); err != nil {
				t.Fatalf("expected no-op success, got error: %v", err)
			}
		})
	}
}

// TestPushService_FB124_CustomerNotifications_OrderNotFound — order tidak ada
// → error untuk keempat notif customer.
func TestPushService_FB124_CustomerNotifications_OrderNotFound(t *testing.T) {
	for _, tc := range customerNotifCases() {
		t.Run(tc.name, func(t *testing.T) {
			svc := service.NewPushService(
				&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
				&mockOrderRepo{order: nil},
			)
			if err := tc.call(svc, uuid.NewString(), "pesan"); err == nil {
				t.Fatal("expected error for missing order, got nil")
			}
		})
	}
}

// merchantNotifCases — daftar method notif merchant.
func merchantNotifCases() []struct {
	name string
	call func(svc domain.PushService, orderID, msg string) error
} {
	return []struct {
		name string
		call func(svc domain.PushService, orderID, msg string) error
	}{
		{"PickedUp", func(svc domain.PushService, id, msg string) error { return svc.NotifyMerchantPickedUp(context.Background(), id, msg) }},
		{"Delivered", func(svc domain.PushService, id, msg string) error { return svc.NotifyMerchantDelivered(context.Background(), id, msg) }},
	}
}

// TestPushService_FB124_MerchantNotifications_NoDevice — order food, owner
// merchant tanpa device token → no-op sukses.
func TestPushService_FB124_MerchantNotifications_NoDevice(t *testing.T) {
	for _, tc := range merchantNotifCases() {
		t.Run(tc.name, func(t *testing.T) {
			merchantID := uuid.NewString()
			order := &domain.Order{
				ID:          uuid.NewString(),
				OrderNumber: "FB-20260808-002",
				CustomerID:  uuid.NewString(),
				MerchantID:  &merchantID,
			}
			svc := service.NewPushService(
				&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
				&mockOrderRepo{order: order},
			)
			if err := tc.call(svc, order.ID, "pesan"); err != nil {
				t.Fatalf("expected no-op success, got error: %v", err)
			}
		})
	}
}

// TestPushService_FB124_MerchantNotifications_ParcelOrder — order parcel
// (tanpa merchant_id) → di-skip diam-diam, no-op sukses.
func TestPushService_FB124_MerchantNotifications_ParcelOrder(t *testing.T) {
	for _, tc := range merchantNotifCases() {
		t.Run(tc.name, func(t *testing.T) {
			order := &domain.Order{
				ID:          uuid.NewString(),
				OrderNumber: "FB-20260808-003",
				CustomerID:  uuid.NewString(),
			}
			svc := service.NewPushService(
				&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
				&mockOrderRepo{order: order},
			)
			if err := tc.call(svc, order.ID, "pesan"); err != nil {
				t.Fatalf("expected silent skip for parcel order, got error: %v", err)
			}
		})
	}
}

// TestPushService_FB124_MerchantNotifications_OrderNotFound — order tidak ada
// → error untuk kedua notif merchant.
func TestPushService_FB124_MerchantNotifications_OrderNotFound(t *testing.T) {
	for _, tc := range merchantNotifCases() {
		t.Run(tc.name, func(t *testing.T) {
			svc := service.NewPushService(
				&mockDeviceTokenRepo{tokensByUser: map[uuid.UUID][]string{}},
				&mockOrderRepo{order: nil},
			)
			if err := tc.call(svc, uuid.NewString(), "pesan"); err == nil {
				t.Fatal("expected error for missing order, got nil")
			}
		})
	}
}
