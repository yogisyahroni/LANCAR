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

func (m *mockTipRepo) UpdateTipStatus(ctx context.Context, tipID uuid.UUID, status string) error {
	for _, t := range m.tips {
		if t.ID == tipID {
			if t.Status != "paid" {
				return errors.New("tip bukan berstatus paid")
			}
			t.Status = status
			t.UpdatedAt = time.Now()
			return nil
		}
	}
	return errors.New("tip not found")
}

type mockTipGateway struct {
	transferred int
	refunded    int
	refundErr   error
}

func (m *mockTipGateway) ProcessTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error {
	m.transferred++
	return nil
}

func (m *mockTipGateway) RefundTip(ctx context.Context, customerID, courierID uuid.UUID, amount int64, referenceID string) error {
	m.refunded++
	return m.refundErr
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

// ─── FB-083: RefundTipByOrder ────────────────────────────────────────────────

func TestTipService_RefundTipByOrder_Paid_Refunded(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	tipRepo := newMockTipRepo()
	gateway := &mockTipGateway{}
	svc := service.NewTipService(tipRepo, &mockOrderRepo{order: order}, gateway)

	orderUUID := uuid.MustParse(order.ID)
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 10000); err != nil {
		t.Fatalf("create tip failed: %v", err)
	}

	// Order batal → refund tip
	if err := svc.RefundTipByOrder(ctx, orderUUID); err != nil {
		t.Fatalf("RefundTipByOrder failed: %v", err)
	}

	// Gateway dipanggil 1x + status → refunded
	if gateway.refunded != 1 {
		t.Errorf("expected 1 gateway refund call, got %d", gateway.refunded)
	}
	tip, err := svc.GetTipByOrder(ctx, orderUUID)
	if err != nil {
		t.Fatalf("get tip failed: %v", err)
	}
	if tip.Status != "refunded" {
		t.Errorf("expected tip status refunded, got %s", tip.Status)
	}
}

// RefundTipByOrder idempotent: panggil dua kali → hanya 1 refund ke gateway.
func TestTipService_RefundTipByOrder_Idempotent(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	tipRepo := newMockTipRepo()
	gateway := &mockTipGateway{}
	svc := service.NewTipService(tipRepo, &mockOrderRepo{order: order}, gateway)

	orderUUID := uuid.MustParse(order.ID)
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 10000); err != nil {
		t.Fatalf("create tip failed: %v", err)
	}

	if err := svc.RefundTipByOrder(ctx, orderUUID); err != nil {
		t.Fatalf("first refund failed: %v", err)
	}
	if err := svc.RefundTipByOrder(ctx, orderUUID); err != nil {
		t.Fatalf("second refund (idempotent) failed: %v", err)
	}
	if gateway.refunded != 1 {
		t.Errorf("expected only 1 gateway refund (idempotent), got %d", gateway.refunded)
	}
}

// Tidak ada tip utk order → no-op, bukan error.
func TestTipService_RefundTipByOrder_NoTip_NoOp(t *testing.T) {
	ctx := context.Background()
	svc := service.NewTipService(newMockTipRepo(), &mockOrderRepo{}, &mockTipGateway{})

	if err := svc.RefundTipByOrder(ctx, uuid.New()); err != nil {
		t.Fatalf("expected no-op for order without tip, got error: %v", err)
	}
}

// Refund gagal (saldo courier tidak cukup) → error di-return, status tetap paid.
func TestTipService_RefundTipByOrder_GatewayError_KeepsPaid(t *testing.T) {
	ctx := context.Background()
	customerID := uuid.New()
	courierID := uuid.New()
	order := newTipOrder(customerID, courierID, domain.StatusDelivered)

	tipRepo := newMockTipRepo()
	gateway := &mockTipGateway{refundErr: errors.New("insufficient courier balance")}
	svc := service.NewTipService(tipRepo, &mockOrderRepo{order: order}, gateway)

	orderUUID := uuid.MustParse(order.ID)
	if _, err := svc.CreateTip(ctx, orderUUID, customerID, 10000); err != nil {
		t.Fatalf("create tip failed: %v", err)
	}

	err := svc.RefundTipByOrder(ctx, orderUUID)
	if err == nil {
		t.Fatal("expected error when gateway refund fails")
	}
	tip, _ := svc.GetTipByOrder(ctx, orderUUID)
	if tip.Status != "paid" {
		t.Errorf("expected status tetap paid (bisa retry), got %s", tip.Status)
	}
}
