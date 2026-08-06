package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

// ─────────────────────────────────────────────
// Mocks (FOOD-BIKE-067) — nama unik agar tidak tabrakan
// dengan mock di payment_service_test.go / refund_service_test.go
// ─────────────────────────────────────────────

type mockSettlementRepo struct {
	domain.MerchantSettlementRepository
	paymentLink *domain.PaymentLink
	plErr       error
	foodData    *domain.FoodOrderSettlementData
	foodErr     error
	existing    *domain.MerchantSettlement
	created     []*domain.MerchantSettlement
}

func (m *mockSettlementRepo) GetPaymentLinkByOrderID(ctx context.Context, orderID string) (*domain.PaymentLink, error) {
	return m.paymentLink, m.plErr
}

func (m *mockSettlementRepo) GetFoodOrderForSettlement(ctx context.Context, orderID string) (*domain.FoodOrderSettlementData, error) {
	return m.foodData, m.foodErr
}

func (m *mockSettlementRepo) GetByIdempotencyKey(ctx context.Context, key string) (*domain.MerchantSettlement, error) {
	return m.existing, nil
}

func (m *mockSettlementRepo) Create(ctx context.Context, s *domain.MerchantSettlement) error {
	m.created = append(m.created, s)
	return nil
}

type mockSettlementConfigRepo struct {
	domain.ConfigRepository
}

func (m *mockSettlementConfigRepo) GetIntConfig(ctx context.Context, key string, fallback int) int {
	switch key {
	case "merchant_settlement_holding_days":
		return 1
	case "merchant_disbursement_fee_idr":
		return 4000
	}
	return fallback
}

type mockSettlementNotifSvc struct {
	domain.NotificationService
}

func (m *mockSettlementNotifSvc) Send(ctx context.Context, req domain.NotificationRequest) error {
	return nil
}

func newSettlementTestSvc(repo *mockSettlementRepo) domain.MerchantSettlementService {
	// awbClient & ledgerRepo nil: tidak dipakai di path HandleFoodOrderDelivered
	// (ledgerRepo di-guard nil di dalam service).
	return service.NewMerchantSettlementService(
		repo,
		&mockSettlementConfigRepo{},
		&mockSettlementNotifSvc{},
		nil,
		nil,
	)
}

func foodSettlementData() *domain.FoodOrderSettlementData {
	return &domain.FoodOrderSettlementData{
		OrderID:        "order-food-1",
		MerchantID:     "merchant-1",
		PlatformFeeIDR: 2000,
		GrossItemIDR:   30000,
	}
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

func TestHandleFoodOrderDelivered_SkipJikaAdaPaymentLink(t *testing.T) {
	repo := &mockSettlementRepo{
		paymentLink: &domain.PaymentLink{ID: "PL-001"},
	}
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-food-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.created) != 0 {
		t.Fatalf("expected no settlement created, got %d", len(repo.created))
	}
}

func TestHandleFoodOrderDelivered_SkipJikaBukanFoodOrder(t *testing.T) {
	repo := &mockSettlementRepo{foodData: nil} // bukan food_delivery
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-regular")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.created) != 0 {
		t.Fatalf("expected no settlement created, got %d", len(repo.created))
	}
}

func TestHandleFoodOrderDelivered_IdempotentSkip(t *testing.T) {
	repo := &mockSettlementRepo{
		foodData: foodSettlementData(),
		existing: &domain.MerchantSettlement{ID: uuid.New()},
	}
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-food-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.created) != 0 {
		t.Fatalf("expected no settlement created (idempotent skip), got %d", len(repo.created))
	}
}

func TestHandleFoodOrderDelivered_NetPayoutNegatifDiblokir(t *testing.T) {
	// gross 3000 - fee 2000 - disburse 4000 = -3000 → harus error
	repo := &mockSettlementRepo{
		foodData: &domain.FoodOrderSettlementData{
			OrderID: "order-food-1", MerchantID: "merchant-1",
			PlatformFeeIDR: 2000, GrossItemIDR: 3000,
		},
	}
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-food-1")
	if err == nil || !strings.Contains(err.Error(), "negative") {
		t.Fatalf("expected negative payout error, got: %v", err)
	}
	if len(repo.created) != 0 {
		t.Fatalf("expected no settlement created, got %d", len(repo.created))
	}
}

func TestHandleFoodOrderDelivered_Sukses(t *testing.T) {
	repo := &mockSettlementRepo{foodData: foodSettlementData()}
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-food-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.created) != 1 {
		t.Fatalf("expected 1 settlement created, got %d", len(repo.created))
	}
	s := repo.created[0]
	if s.IdempotencyKey != "settle-order-order-food-1" {
		t.Fatalf("wrong idempotency key: %s", s.IdempotencyKey)
	}
	if s.PaymentLinkID != "" {
		t.Fatalf("payment_link_id harus kosong untuk food order, got %q", s.PaymentLinkID)
	}
	if s.MerchantID != "merchant-1" || s.OrderID != "order-food-1" {
		t.Fatalf("wrong merchant/order: %+v", s)
	}
	// gross 30000 - fee 2000 - disburse 4000 = 24000
	if s.GrossItemPriceIDR != 30000 || s.MerchantFeeIDR != 2000 || s.NetPayoutIDR != 24000 {
		t.Fatalf("wrong amounts: gross=%d fee=%d net=%d", s.GrossItemPriceIDR, s.MerchantFeeIDR, s.NetPayoutIDR)
	}
	if s.Status != domain.SettlementStatusHolding {
		t.Fatalf("expected HOLDING status, got %s", s.Status)
	}
	if s.HoldingReleaseAt == nil || s.PODConfirmedAt == nil {
		t.Fatalf("holding/pod timestamps harus terisi")
	}
}

func TestHandleFoodOrderDelivered_PaymentLinkLookupError(t *testing.T) {
	repo := &mockSettlementRepo{plErr: errors.New("db down")}
	svc := newSettlementTestSvc(repo)

	err := svc.HandleFoodOrderDelivered(context.Background(), "order-food-1")
	if err == nil {
		t.Fatalf("expected error from payment link lookup")
	}
}
