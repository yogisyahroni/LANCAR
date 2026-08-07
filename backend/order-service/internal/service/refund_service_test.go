package service_test

import (
	"context"
	"testing"
	"time"

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

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, nil)

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

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, nil)

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

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, nil)

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

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, nil)

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

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, nil)

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

// mockFoodRepo minimal untuk test partial refund (FB-080).
// Method lain di-stub (tidak dipakai test refund).
type mockFoodRepo struct {
	items []domain.FoodOrderItem
}

func (m *mockFoodRepo) GetFoodOrderItems(ctx context.Context, orderID string) ([]domain.FoodOrderItem, error) {
	return m.items, nil
}
func (m *mockFoodRepo) GetFoodMerchant(ctx context.Context, merchantID string) (*domain.FoodMerchantInfo, error) {
	return nil, nil
}
func (m *mockFoodRepo) GetFoodMenuItems(ctx context.Context, menuIDs []string) ([]domain.FoodMenuItemInfo, error) {
	return nil, nil
}
func (m *mockFoodRepo) CreateFoodOrderWithItems(ctx context.Context, order *domain.Order, items []domain.FoodOrderItem) error {
	return nil
}
func (m *mockFoodRepo) GetFoodOrderForMerchant(ctx context.Context, orderID, merchantID string) (*domain.Order, error) {
	return nil, nil
}
func (m *mockFoodRepo) AcceptFoodOrder(ctx context.Context, orderID string, prepMinutes int) error {
	return nil
}
func (m *mockFoodRepo) RejectFoodOrder(ctx context.Context, orderID, reason string) error {
	return nil
}
func (m *mockFoodRepo) GetPreparingFoodOrders(ctx context.Context) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockFoodRepo) GetPendingMerchantFoodOrders(ctx context.Context, timeout time.Duration) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockFoodRepo) ListFoodMerchants(ctx context.Context, lat, lng float64, search string, limit int) ([]domain.FoodMerchantInfo, error) {
	return nil, nil
}
func (m *mockFoodRepo) GetFoodMerchantMenu(ctx context.Context, merchantID string) ([]domain.FoodMenuItemInfo, error) {
	return nil, nil
}

// FB-080: partial refund per item — refund = Σ(snapshot item_price × qty),
// ongkir TIDAK direfund kecuali IncludeDeliveryFee.
func TestRefundService_CalculateItemRefund_ItemsOnly(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}
	foodRepo := &mockFoodRepo{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, foodRepo)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusDelivered,
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
		DistanceFeeIDR: 10000,
		SurgeFeeIDR:    0,
		PlatformFeeIDR: 5000,
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 55000,
		Status:    domain.PaymentStatusPaid,
	}
	foodRepo.items = []domain.FoodOrderItem{
		{ID: "item-1", OrderID: orderID.String(), MenuItemID: "menu-1", ItemName: "Nasi Goreng", ItemPrice: 20000, Quantity: 2, Subtotal: 40000},
		{ID: "item-2", OrderID: orderID.String(), MenuItemID: "menu-2", ItemName: "Es Teh", ItemPrice: 5000, Quantity: 1, Subtotal: 5000},
	}

	// Refund 1x Nasi Goreng (20000), tanpa ongkir
	rec, err := svc.CalculateItemRefund(ctx, orderID, []domain.ItemRefundRequest{
		{MenuItemID: "menu-1", Quantity: 1, Reason: "makanan_tidak_sesuai"},
	}, domain.RefundItemOptions{IncludeDeliveryFee: false})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 20000 {
		t.Errorf("expected item refund 20000, got %d", rec.AmountIDR)
	}
}

// FB-080: IncludeDeliveryFee=true (kesalahan driver) → ongkir ikut direfund.
func TestRefundService_CalculateItemRefund_IncludeDeliveryFee(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}
	foodRepo := &mockFoodRepo{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, foodRepo)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusDelivered,
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
		DistanceFeeIDR: 10000,
		SurgeFeeIDR:    0,
		PlatformFeeIDR: 5000,
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 55000,
		Status:    domain.PaymentStatusPaid,
	}
	foodRepo.items = []domain.FoodOrderItem{
		{ID: "item-1", OrderID: orderID.String(), MenuItemID: "menu-1", ItemName: "Nasi Goreng", ItemPrice: 20000, Quantity: 2, Subtotal: 40000},
	}

	// Refund 1x Nasi Goreng + ongkir 10000 = 30000
	rec, err := svc.CalculateItemRefund(ctx, orderID, []domain.ItemRefundRequest{
		{MenuItemID: "menu-1", Quantity: 1, Reason: "kesalahan_driver"},
	}, domain.RefundItemOptions{IncludeDeliveryFee: true})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if rec == nil {
		t.Fatal("expected refund record, got nil")
	}
	if rec.AmountIDR != 30000 {
		t.Errorf("expected refund 30000 (item 20000 + ongkir 10000), got %d", rec.AmountIDR)
	}
}

// FB-080: quantity refund melebihi pesanan → ditolak.
func TestRefundService_CalculateItemRefund_QtyExceeds(t *testing.T) {
	ctx := context.Background()
	refundRepo := newMockRefundRepo()
	orderRepo := &mockOrderRepo{}
	paymentRepo := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	gateway := &mockRefundGateway{}
	foodRepo := &mockFoodRepo{}

	svc := service.NewRefundService(refundRepo, orderRepo, paymentRepo, gateway, &MockRedisRepo{}, nil, foodRepo)

	orderID := uuid.New()
	orderRepo.order = &domain.Order{
		ID:             orderID.String(),
		CustomerID:     "cust-1",
		Status:         domain.StatusDelivered,
		ServiceSubType: "food_delivery",
		MerchantID:     ptrString("merchant-1"),
	}
	paymentRepo.payments["pay-1"] = &domain.Payment{
		ID:        "pay-1",
		OrderID:   orderID.String(),
		AmountIDR: 55000,
		Status:    domain.PaymentStatusPaid,
	}
	foodRepo.items = []domain.FoodOrderItem{
		{ID: "item-1", OrderID: orderID.String(), MenuItemID: "menu-1", ItemName: "Nasi Goreng", ItemPrice: 20000, Quantity: 2, Subtotal: 40000},
	}

	_, err := svc.CalculateItemRefund(ctx, orderID, []domain.ItemRefundRequest{
		{MenuItemID: "menu-1", Quantity: 3}, // melebihi 2
	}, domain.RefundItemOptions{})
	if err == nil {
		t.Fatal("expected error for qty exceeding order, got nil")
	}
}
