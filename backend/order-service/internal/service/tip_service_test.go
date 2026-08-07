package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

type mockTipRepo struct {
	tips map[uuid.UUID]*domain.DriverTip
}

func newMockTipRepo() *mockTipRepo {
	return &mockTipRepo{tips: make(map[uuid.UUID]*domain.DriverTip)}
}

func (m *mockTipRepo) CreateTip(ctx context.Context, tip *domain.DriverTip) error {
	if _, exists := m.tips[tip.OrderID]; exists {
		return errors.New("duplicate order_id")
	}
	tip.ID = uuid.New()
	tip.CreatedAt = time.Now()
	tip.UpdatedAt = time.Now()
	m.tips[tip.OrderID] = tip
	return nil
}

func (m *mockTipRepo) GetTipByOrderID(ctx context.Context, orderID uuid.UUID) (*domain.DriverTip, error) {
	if tip, ok := m.tips[orderID]; ok {
		return tip, nil
	}
	return nil, nil
}

func (m *mockTipRepo) ListTipsByCourier(ctx context.Context, courierID uuid.UUID, limit, offset int) ([]domain.DriverTip, error) {
	var res []domain.DriverTip
	for _, t := range m.tips {
		if t.CourierID == courierID {
			res = append(res, *t)
		}
	}
	return res, nil
}

func (m *mockTipRepo) SumTipsByCourier(ctx context.Context, courierID uuid.UUID) (int64, int, error) {
	var total int64
	var count int
	for _, t := range m.tips {
		if t.CourierID == courierID && t.Status == "paid" {
			total += t.AmountIDR
			count++
		}
	}
	return total, count, nil
}

func (m *mockTipRepo) SumTipsByCourierSince(ctx context.Context, courierID uuid.UUID, since time.Time) (int64, int, error) {
	var total int64
	var count int
	for _, t := range m.tips {
		if t.CourierID == courierID && t.Status == "paid" && t.CreatedAt.After(since) {
			total += t.AmountIDR
			count++
		}
	}
	return total, count, nil
}

type mockTipGateway struct {
	transferred int
}

func (m *mockTipGateway) ProcessTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error {
	m.transferred++
	return nil
}

func newTipOrder(customerID, courierID uuid.UUID, status domain.OrderStatus) *domain.Order {
	courierStr := courierID.String()
	return &domain.Order{
		ID:         uuid.NewString(),
		CustomerID: customerID.String(),
		CourierID:  &courierStr,
		Status:     status,
	}
}

func TestTipService_CreateTip_Success(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	tipRepo := newMockTipRepo()
	orderRepo := &mockOrderRepo{order: order}
	gateway := &mockTipGateway{}
	svc := service.NewTipService(tipRepo, orderRepo, gateway)

	tip, err := svc.CreateTip(ctx, uuid.MustParse(order.ID), customerID, 10000)
	if err != nil {
		t.Fatalf("CreateTip failed: %v", err)
	}
	if tip.AmountIDR != 10000 {
		t.Fatalf("expected 10000, got %d", tip.AmountIDR)
	}
	if tip.CourierID != courierID {
		t.Fatalf("expected courier %s, got %s", courierID, tip.CourierID)
	}
	if gateway.transferred != 1 {
		t.Fatalf("expected gateway transfer, got %d calls", gateway.transferred)
	}
}

func TestTipService_CreateTip_NotOwner_Rejected(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	svc := service.NewTipService(newMockTipRepo(), &mockOrderRepo{order: order}, &mockTipGateway{})

	otherCustomer := uuid.New()
	_, err := svc.CreateTip(ctx, uuid.MustParse(order.ID), otherCustomer, 10000)
	if err == nil {
		t.Fatal("expected error for non-owner customer")
	}
}

func TestTipService_CreateTip_NoCourier_Rejected(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	order := newTipOrder(customerID, uuid.New(), domain.StatusPendingMerchant)
	order.CourierID = nil

	svc := service.NewTipService(newMockTipRepo(), &mockOrderRepo{order: order}, &mockTipGateway{})

	_, err := svc.CreateTip(ctx, uuid.MustParse(order.ID), customerID, 10000)
	if err == nil {
		t.Fatal("expected error when courier not assigned")
	}
}

func TestTipService_CreateTip_NotEligibleStatus_Rejected(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusPendingMerchant)

	svc := service.NewTipService(newMockTipRepo(), &mockOrderRepo{order: order}, &mockTipGateway{})

	_, err := svc.CreateTip(ctx, uuid.MustParse(order.ID), customerID, 10000)
	if err == nil {
		t.Fatal("expected error for non-eligible status")
	}
}

func TestTipService_CreateTip_AmountLimits(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	svc := service.NewTipService(newMockTipRepo(), &mockOrderRepo{order: order}, &mockTipGateway{})

	orderUUID := uuid.MustParse(order.ID)
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 500); err == nil {
		t.Fatal("expected error for tip below minimum")
	}
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 500000); err == nil {
		t.Fatal("expected error for tip above maximum")
	}
}

func TestTipService_CreateTip_Duplicate_Rejected(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	tipRepo := newMockTipRepo()
	svc := service.NewTipService(tipRepo, &mockOrderRepo{order: order}, &mockTipGateway{})

	orderUUID := uuid.MustParse(order.ID)
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 10000); err != nil {
		t.Fatalf("first tip failed: %v", err)
	}
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 10000); err == nil {
		t.Fatal("expected error for duplicate tip on same order")
	}
}

func TestTipService_GetTipSummary(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()

	tipRepo := newMockTipRepo()
	orderRepo := &mockOrderRepo{}
	svc := service.NewTipService(tipRepo, orderRepo, &mockTipGateway{})

	for i := 0; i < 3; i++ {
		order := newTipOrder(customerID, courierID, domain.StatusDelivered)
		orderRepo.order = order // mock menyimpan 1 order — set per iterasi
		if _, err := svc.CreateTip(ctx, uuid.MustParse(order.ID), customerID, 5000); err != nil {
			t.Fatalf("tip %d failed: %v", i, err)
		}
	}

	summary, err := svc.GetTipSummary(ctx, courierID)
	if err != nil {
		t.Fatalf("GetTipSummary failed: %v", err)
	}
	if summary.TotalTips != 3 {
		t.Fatalf("expected 3 tips, got %d", summary.TotalTips)
	}
	if summary.TotalAmount != 15000 {
		t.Fatalf("expected 15000, got %d", summary.TotalAmount)
	}
	if summary.TodayTips != 3 {
		t.Fatalf("expected 3 today tips, got %d", summary.TodayTips)
	}
}
