package service_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

type mockPaymentRepo struct {
	payments map[string]*domain.Payment
	updated  bool
}

func (m *mockPaymentRepo) Create(ctx context.Context, p *domain.Payment) error {
	m.payments[p.ID] = p
	return nil
}
func (m *mockPaymentRepo) GetByID(ctx context.Context, id string) (*domain.Payment, error) {
	return nil, nil
}
func (m *mockPaymentRepo) GetByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) {
	for _, p := range m.payments {
		if p.OrderID == orderID {
			return p, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (m *mockPaymentRepo) GetByPaymentNumber(ctx context.Context, paymentNumber string) (*domain.Payment, error) {
	return nil, nil
}
func (m *mockPaymentRepo) UpdateStatus(ctx context.Context, id string, status domain.PaymentStatus, paidAt *time.Time, providerRef *string, webhookPayload []byte) error {
	if p, ok := m.payments[id]; ok {
		p.Status = status
		p.PaidAt = paidAt
		m.updated = true
	}
	return nil
}

type mockOrderRepo struct {
	order *domain.Order
}

func (m *mockOrderRepo) Create(ctx context.Context, order *domain.Order) error { return nil }
func (m *mockOrderRepo) GetByID(ctx context.Context, id string) (*domain.Order, error) {
	if m.order != nil && m.order.ID == id {
		return m.order, nil
	}
	return nil, domain.ErrNotFound
}
func (m *mockOrderRepo) GetByOrderNumber(ctx context.Context, orderNumber string) (*domain.Order, error) {
	if m.order != nil && m.order.OrderNumber == orderNumber {
		return m.order, nil
	}
	return nil, domain.ErrNotFound
}
func (m *mockOrderRepo) ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockOrderRepo) GetByAWB(ctx context.Context, awb string) (*domain.Order, error) { return nil, nil }
func (m *mockOrderRepo) UpdateStatus(ctx context.Context, id string, status domain.OrderStatus) error {
	if m.order != nil && m.order.ID == id {
		m.order.Status = status
	}
	return nil
}
func (m *mockOrderRepo) GetCourierIDByUserID(ctx context.Context, userID string) (string, error) {
	return "courier-1", nil
}
func (m *mockOrderRepo) UpdateOrderAWB(ctx context.Context, orderID, awbNumber, trackingURL string) error {
	return nil
}

func (m *mockOrderRepo) UpdateDimensions(ctx context.Context, id string, length, width, height, weight float64) error {
	return nil
}
func (m *mockOrderRepo) CancelExpiredOrders(ctx context.Context, timeout time.Duration) (int64, error) {
	return 0, nil
}
func (m *mockOrderRepo) AssignCourier(ctx context.Context, orderID string, courierID string) error {
	return nil
}
func (m *mockOrderRepo) GetActiveCourierOrder(ctx context.Context, courierID string) (string, error) {
	return "", nil
}
func (m *mockOrderRepo) GetPendingAssignmentOrders(ctx context.Context, threshold time.Duration) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockOrderRepo) GetGhostedAcceptedOrders(ctx context.Context, timeout time.Duration) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockOrderRepo) ReleaseGhostedOrder(ctx context.Context, orderID string) error {
	return nil
}
func (m *mockOrderRepo) SetDispatchExpiry(ctx context.Context, orderID string, expiry time.Time) error {
	return nil
}
func (m *mockOrderRepo) ListMeetingPoints(ctx context.Context, lat, lng float64, radiusKM float64) ([]domain.MeetingPoint, error) {
	return nil, nil
}
func (m *mockOrderRepo) CreateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	return nil
}
func (m *mockOrderRepo) UpdateMeetingPoint(ctx context.Context, mp *domain.MeetingPoint) error {
	return nil
}
func (m *mockOrderRepo) DeleteMeetingPoint(ctx context.Context, id string) error { return nil }
func (m *mockOrderRepo) GetMeetingPointAnalytics(ctx context.Context) ([]domain.MeetingPointAnalytics, error) {
	return nil, nil
}
func (m *mockOrderRepo) SaveScan(ctx context.Context, scan *domain.PackageScan) error { return nil }
func (m *mockOrderRepo) GetScansForOrder(ctx context.Context, orderID string) ([]*domain.PackageScan, error) {
	return nil, nil
}
func (m *mockOrderRepo) GetByBatchID(ctx context.Context, batchID string) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockOrderRepo) CreateConsolidationBag(ctx context.Context, bag *domain.ConsolidationBag) error {
	return nil
}
func (m *mockOrderRepo) GetConsolidationBag(ctx context.Context, bagNumber string) (*domain.ConsolidationBag, error) {
	return nil, nil
}
func (m *mockOrderRepo) UpdateConsolidationBagStatus(ctx context.Context, bagNumber string, status string) error {
	return nil
}
func (m *mockOrderRepo) GetLatestScanForOrder(ctx context.Context, orderID string) (*domain.PackageScan, error) {
	return nil, nil
}
func (m *mockOrderRepo) GetCourierInfo(ctx context.Context, courierID string) (*domain.CourierInfo, error) {
	return nil, nil
}
func (m *mockOrderRepo) GetScansByBagNumber(ctx context.Context, bagNumber string) ([]*domain.PackageScan, error) {
	return nil, nil
}
func (m *mockOrderRepo) SaveOrderRating(ctx context.Context, orderID string, courierID string, rating float64, comment string) error {
	return nil
}
func (m *mockOrderRepo) SaveMerchantRating(ctx context.Context, orderID string, merchantID string, ratedBy string, rating float64, comment string) error {
	return nil
}
func (m *mockOrderRepo) GetDeliveredUnratedOrders(ctx context.Context, customerID string, maxReminder int, reminderIntervalHours int) ([]*domain.Order, error) {
	return nil, nil
}
func (m *mockOrderRepo) IncrementRatingReminderCount(ctx context.Context, orderID string) error {
	return nil
}
func (m *mockOrderRepo) GetLogisticsProviderConfig(ctx context.Context, provider string) (float64, float64, error) {
	return 0, 0, nil
}
func (m *mockOrderRepo) GetUserSenderName(ctx context.Context, userID string) (string, error) {
	return "", nil
}

type mockPaymentGateway struct{}

func (m *mockPaymentGateway) GenerateQRIS(ctx context.Context, req domain.PaymentGatewayRequest) (domain.PaymentGatewayResponse, error) {
	return domain.PaymentGatewayResponse{
		ProviderReference: "MOCK-REF",
		QRCodeURL:         "http://mock.qr",
		QRCodeString:      "MOCK_QR_STRING",
	}, nil
}
func (m *mockPaymentGateway) VerifyWebhookSignature(ctx context.Context, payload []byte, signature string) error {
	return nil
}

func (m *mockPaymentGateway) GenerateSnap(ctx context.Context, req domain.SnapRequest) (domain.SnapResponse, error) {
	return domain.SnapResponse{
		Token:       "MOCK-SNAP-TOKEN",
		RedirectURL: "http://mock.snap/redirect",
	}, nil
}

type mockConfigRepo struct{}

func (m *mockConfigRepo) GetConfig(ctx context.Context, key string) (*domain.SystemConfig, error) {
	return nil, nil
}
func (m *mockConfigRepo) GetFloatConfig(ctx context.Context, key string, fallback float64) float64 {
	return fallback
}
func (m *mockConfigRepo) GetIntConfig(ctx context.Context, key string, fallback int) int {
	return fallback
}
func (m *mockConfigRepo) GetStringConfig(ctx context.Context, key string, fallback string) string {
	return fallback
}

type mockTaxService struct{}

func (m *mockTaxService) CalculatePaymentMDRTax(ctx context.Context, mdrAmountIDR int64) (domain.TaxSnapshot, error) {
	return domain.TaxSnapshot{
		PPNIDR: int64(float64(mdrAmountIDR) * 0.11),
		TaxRuleCode: "DEFAULT_11",
	}, nil
}

func (m *mockTaxService) CalculateOrderTax(ctx context.Context, deliveryFeeIDR int64, itemSubtotalIDR int64, hasInsurance bool) (domain.TaxSnapshot, error) {
	return domain.TaxSnapshot{}, nil
}

func (m *mockTaxService) GenerateEFakturExport(ctx context.Context, periodMonthYYYYMM string, requestedBy string) (*domain.TaxEFakturExport, error) {
	return nil, nil
}

func (m *mockTaxService) UpdateEFakturStatus(ctx context.Context, id string, status string) error {
	return nil
}


func TestPaymentService_CreatePayment(t *testing.T) {
	orderID := uuid.NewString()
	mpr := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	mor := &mockOrderRepo{order: &domain.Order{ID: orderID, Status: domain.StatusPendingPayment, TotalPriceIDR: 100000}}
	mpg := &mockPaymentGateway{}
	mcr := &mockConfigRepo{}
	mts := &mockTaxService{}

	svc := service.NewPaymentService(mpr, mor, mpg, mcr, mts)

	p, err := svc.CreatePayment(context.Background(), orderID)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if p == nil {
		t.Fatal("expected payment to be created")
	}

	if p.AmountIDR != 100000 {
		t.Errorf("expected amount 100000, got %d", p.AmountIDR)
	}
	if p.MDRAmountIDR != 700 { // 0.7% of 100000
		t.Errorf("expected MDR 700, got %d", p.MDRAmountIDR)
	}
	if p.PPNAmountIDR != 77 { // 11% of 700
		t.Errorf("expected PPN 77, got %d", p.PPNAmountIDR)
	}
	if p.NetOperationalIDR != 100000-700-77 {
		t.Errorf("expected Net 99223, got %d", p.NetOperationalIDR)
	}
	if p.Status != domain.PaymentStatusPending {
		t.Errorf("expected status pending, got %s", p.Status)
	}
}

func TestPaymentService_HandleWebhook_Settlement(t *testing.T) {
	orderID := uuid.NewString()
	mpr := &mockPaymentRepo{payments: make(map[string]*domain.Payment)}
	mor := &mockOrderRepo{order: &domain.Order{ID: orderID, Status: domain.StatusPendingPayment, TotalPriceIDR: 100000}}
	mpg := &mockPaymentGateway{}
	mcr := &mockConfigRepo{}
	mts := &mockTaxService{}

	svc := service.NewPaymentService(mpr, mor, mpg, mcr, mts)
	p, _ := svc.CreatePayment(context.Background(), orderID)

	// Create mock payload
	payloadMap := map[string]interface{}{
		"order_id":           orderID,
		"transaction_status": "settlement",
	}
	payloadBytes, _ := json.Marshal(payloadMap)

	err := svc.HandleWebhook(context.Background(), payloadBytes, "mock-sig")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if p.Status != domain.PaymentStatusPaid {
		t.Errorf("expected payment status paid, got %s", p.Status)
	}

	if mor.order.Status != domain.StatusPendingAssignment {
		t.Errorf("expected order status pending_assignment, got %s", mor.order.Status)
	}
}
