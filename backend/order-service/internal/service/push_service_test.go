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
