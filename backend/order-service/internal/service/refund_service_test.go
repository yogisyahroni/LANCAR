package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

type mockRefundRepo struct {
	refunds map[uuid.UUID]*domain.RefundRecord
}

func newMockRefundRepo() *mockRefundRepo {
	return &mockRefundRepo{refunds: make(map[uuid.UUID]*domain.RefundRecord)}
}

func (m *mockRefundRepo) CreateRefund(ctx context.Context, record *domain.RefundRecord) error {
	m.refunds[record.ID] = record
	return nil
}

func (m *mockRefundRepo) UpdateRefundStatus(ctx context.Context, id uuid.UUID, status domain.RefundStatus, ref *string, errReason *string) error {
	if r, ok := m.refunds[id]; ok {
		r.Status = status
		r.GatewayRef = ref
		r.FailureReason = errReason
	}
	return nil
}

func (m *mockRefundRepo) GetRefundsByOrder(ctx context.Context, orderID uuid.UUID) ([]domain.RefundRecord, error) {
	var res []domain.RefundRecord
	for _, r := range m.refunds {
		if r.OrderID == orderID {
			res = append(res, *r)
		}
	}
	return res, nil
}

func (m *mockRefundRepo) GetPendingRefunds(ctx context.Context) ([]domain.RefundRecord, error) {
	var res []domain.RefundRecord
	for _, r := range m.refunds {
		if r.Status == domain.RefundStatusPending {
			res = append(res, *r)
		}
	}
	return res, nil
}

type mockRefundGateway struct {
	processedCount int
	lastOrderID    string
	lastAmount     int
}

func (m *mockRefundGateway) ProcessRefund(ctx context.Context, orderID string, paymentRef string, amount int, reason string) (string, error) {
	m.processedCount++
	m.lastOrderID = orderID
	m.lastAmount = amount
	return "wallet-ref-" + orderID, nil
}

func TestRefundService_CalculateAndTriggerRefund_WalletPayment(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:         orderID.String(),
		CustomerID: "cust-123",
		Status:     domain.StatusPending,
	}

	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 50000,
		Status:    domain.PaymentStatusPaid,
		// ProviderReference is nil for Wallet payment
	}

	rec, err := svc.CalculateAndTriggerRefund(ctx, orderID, "Customer cancelled", domain.RefundOptions{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 50000 {
		t.Errorf("expected 100%% refund amount 50000, got %d", rec.AmountIDR)
	}

	// Verify gateway was called and status updated to processed
	if gateway.processedCount != 1 {
		t.Errorf("expected gateway called once, got %d", gateway.processedCount)
	}
	if gateway.lastOrderID != orderID.String() {
		t.Errorf("expected gateway called with orderID %s, got %s", orderID.String(), gateway.lastOrderID)
	}
	if rec.Status != domain.RefundStatusProcessed {
		t.Errorf("expected status processed, got %s", rec.Status)
	}
}

func TestRefundService_CalculateAndTriggerRefund_AcceptedStatus_80Percent(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:         orderID.String(),
		CustomerID: "cust-123",
		Status:     domain.StatusAccepted, // Courier assigned, 80% refund
	}

	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 100000,
		Status:    domain.PaymentStatusPaid,
	}

	rec, err := svc.CalculateAndTriggerRefund(ctx, orderID, "Customer cancelled after accept", domain.RefundOptions{})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 80000 { // 80% of 100000
		t.Errorf("expected 80%% refund amount 80000, got %d", rec.AmountIDR)
	}
}

// FB-079: food preparing → refund penuh (sebelum ada driver)
func TestRefundService_FoodPreparing_FullRefund(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusCancelled, // sudah di-cancel saat refund diproses
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
		PlatformFeeIDR: 5000,
		PPNIDR:         1000,
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 50000,
		Status:    domain.PaymentStatusPaid,
	}

	// OriginalStatus = preparing (status sebelum cancel) → 100% refund
	rec, err := svc.CalculateAndTriggerRefund(ctx, orderID, "Customer cancelled (preparing)", domain.RefundOptions{
		OriginalStatus: domain.StatusPreparing,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 50000 {
		t.Errorf("expected full refund 50000, got %d", rec.AmountIDR)
	}
}

// FB-079: food accepted (driver assigned) → refund dikurangi biaya layanan
func TestRefundService_FoodAccepted_WithholdServiceFee(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil)

	orderID := uuid.New()
	courierID := "courier-1"
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusCancelled,
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
		CourierID:      &courierID,
		PlatformFeeIDR: 5000,
		PPNIDR:         1000,
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 50000,
		Status:    domain.PaymentStatusPaid,
	}

	// OriginalStatus = accepted → kena biaya layanan: refund = 50000 - 5000
	rec, err := svc.CalculateAndTriggerRefund(ctx, orderID, "Customer cancelled (accepted)", domain.RefundOptions{
		OriginalStatus: domain.StatusAccepted,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 45000 {
		t.Errorf("expected refund 45000 (50000 - 5000 fee), got %d", rec.AmountIDR)
	}
	if rec.PlatformFeeReversalIDR != 0 {
		t.Errorf("expected platform fee reversal 0 (fee ditahan), got %d", rec.PlatformFeeReversalIDR)
	}
}

// FB-079: food picked_up → 0% refund (harusnya ditolak di handler → dispute)
func TestRefundService_FoodPickedUp_NoRefund(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusCancelled,
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
		PlatformFeeIDR: 5000,
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 50000,
		Status:    domain.PaymentStatusPaid,
	}

	rec, err := svc.CalculateAndTriggerRefund(ctx, orderID, "Customer cancelled (picked up)", domain.RefundOptions{
		OriginalStatus: domain.StatusPickedUp,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec != nil {
		t.Errorf("expected nil refund for picked_up, got %+v", rec)
	}
}

func ptrString(s string) *string {
	return &s
}
