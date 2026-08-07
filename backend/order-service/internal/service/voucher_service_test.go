package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/service"
)

// ── Mock ────────────────────────────────────────────────────────────────

type mockVoucherRepo struct {
	vouchers map[string]*domain.Voucher // key: code
	usages   map[string]bool            // key: "voucherID:userID" (single-use)
	applyCalls int
}

func newMockVoucherRepo() *mockVoucherRepo {
	return &mockVoucherRepo{
		vouchers: make(map[string]*domain.Voucher),
		usages:   make(map[string]bool),
	}
}

func (m *mockVoucherRepo) GetActiveByCode(ctx context.Context, code string) (*domain.Voucher, error) {
	return m.vouchers[code], nil
}

func (m *mockVoucherRepo) HasUserUsed(ctx context.Context, voucherID, userID uuid.UUID) (bool, error) {
	return m.usages[voucherID.String()+":"+userID.String()], nil
}

func (m *mockVoucherRepo) ApplyUsage(ctx context.Context, voucherID, orderID, userID uuid.UUID, discountIDR int64) error {
	m.applyCalls++
	m.usages[voucherID.String()+":"+userID.String()] = true
	m.vouchers[findKeyByID(m.vouchers, voucherID)].UsedCount++
	return nil
}

func findKeyByID(vouchers map[string]*domain.Voucher, id uuid.UUID) string {
	for k, v := range vouchers {
		if v.ID == id {
			return k
		}
	}
	return ""
}

// ── Helpers ─────────────────────────────────────────────────────────────

func intPtr(i int) *int { return &i }

func makeVoucher(code string, vType string, value int, minOrder int, quota *int) *domain.Voucher {
	id := uuid.New()
	now := time.Now()
	future := now.Add(24 * time.Hour)
	return &domain.Voucher{
		ID:             id,
		Code:           code,
		Name:           "Voucher " + code,
		Type:           vType,
		Value:          value,
		MinOrderIDR:    minOrder,
		Quota:          quota,
		IsActive:       true,
		IsSingleUse:    false,
		ApplicableModels: nil,
		ValidFrom:      now.Add(-time.Hour),
		ValidUntil:     &future,
	}
}

func baseVoucherRepo() *mockVoucherRepo {
	repo := newMockVoucherRepo()
	repo.vouchers["HEMAT10"] = makeVoucher("HEMAT10", "percentage", 10, 15000, intPtr(100))
	repo.vouchers["POTONG5"] = makeVoucher("POTONG5", "fixed", 5000, 0, nil)
	repo.vouchers["GRATIS"] = makeVoucher("GRATIS", "free_shipping", 0, 0, nil)
	return repo
}

// ── Tests ───────────────────────────────────────────────────────────────

func TestVoucherValidate_ValidPercentage(t *testing.T) {
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "HEMAT10", uuid.New().String(), 100000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got invalid: %s", res.Error)
	}
	if res.DiscountIDR != 10000 {
		t.Fatalf("expected 10000 discount, got %d", res.DiscountIDR)
	}
	if res.Code != "HEMAT10" {
		t.Fatalf("expected code HEMAT10, got %s", res.Code)
	}
}

func TestVoucherValidate_PercentageCapMaxDiscount(t *testing.T) {
	v := makeVoucher("CAP", "percentage", 50, 0, nil)
	v.MaxDiscountIDR = intPtr(20000)
	repo := baseVoucherRepo()
	repo.vouchers["CAP"] = v

	svc := service.NewVoucherService(repo)
	res, err := svc.Validate(context.Background(), "CAP", uuid.New().String(), 100000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got invalid: %s", res.Error)
	}
	if res.DiscountIDR != 20000 {
		t.Fatalf("expected cap 20000, got %d", res.DiscountIDR)
	}
}

func TestVoucherValidate_Fixed(t *testing.T) {
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "POTONG5", uuid.New().String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid || res.DiscountIDR != 5000 {
		t.Fatalf("expected valid fixed 5000, got valid=%v discount=%d", res.Valid, res.DiscountIDR)
	}
}

func TestVoucherValidate_FreeShipping(t *testing.T) {
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "GRATIS", uuid.New().String(), 30000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid || res.DiscountIDR != 8000 {
		t.Fatalf("expected free_shipping 8000, got valid=%v discount=%d", res.Valid, res.DiscountIDR)
	}
}

func TestVoucherValidate_MinOrderNotMet(t *testing.T) {
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "HEMAT10", uuid.New().String(), 5000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (min order not met), got valid")
	}
	if res.Error == "" {
		t.Fatal("expected error message, got empty")
	}
}

func TestVoucherValidate_QuotaExhausted(t *testing.T) {
	v := makeVoucher("HABIS", "fixed", 3000, 0, intPtr(1))
	v.UsedCount = 1
	repo := baseVoucherRepo()
	repo.vouchers["HABIS"] = v

	svc := service.NewVoucherService(repo)
	res, err := svc.Validate(context.Background(), "HABIS", uuid.New().String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (quota exhausted), got valid")
	}
}

func TestVoucherValidate_Expired(t *testing.T) {
	v := makeVoucher("LAMA", "fixed", 3000, 0, nil)
	past := time.Now().Add(-48 * time.Hour)
	v.ValidUntil = &past
	repo := baseVoucherRepo()
	repo.vouchers["LAMA"] = v

	svc := service.NewVoucherService(repo)
	res, err := svc.Validate(context.Background(), "LAMA", uuid.New().String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (expired), got valid")
	}
}

func TestVoucherValidate_SingleUseAlreadyUsed(t *testing.T) {
	v := makeVoucher("SEKALI", "fixed", 3000, 0, nil)
	v.IsSingleUse = true
	repo := baseVoucherRepo()
	repo.vouchers["SEKALI"] = v

	userID := uuid.New()
	// user sudah pakai voucher ini
	repo.usages[v.ID.String()+":"+userID.String()] = true

	svc := service.NewVoucherService(repo)
	res, err := svc.Validate(context.Background(), "SEKALI", userID.String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (single-use already used), got valid")
	}
}

func TestVoucherValidate_ApplicableModelRestricted(t *testing.T) {
	v := makeVoucher("FOODONLY", "fixed", 3000, 0, nil)
	v.ApplicableModels = []string{"food_delivery"}
	repo := baseVoucherRepo()
	repo.vouchers["FOODONLY"] = v

	svc := service.NewVoucherService(repo)
	res, err := svc.Validate(context.Background(), "FOODONLY", uuid.New().String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (model not applicable), got valid")
	}
}

func TestVoucherValidate_UnknownCode(t *testing.T) {
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "TIDAKADA", uuid.New().String(), 50000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Valid {
		t.Fatal("expected invalid (unknown code), got valid")
	}
}

func TestVoucherValidate_DiscountCappedToBase(t *testing.T) {
	// voucher fixed 5000 tapi base cuma 3000 → diskon = 3000
	svc := service.NewVoucherService(baseVoucherRepo())
	res, err := svc.Validate(context.Background(), "POTONG5", uuid.New().String(), 3000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid, got invalid: %s", res.Error)
	}
	if res.DiscountIDR != 3000 {
		t.Fatalf("expected discount capped to 3000, got %d", res.DiscountIDR)
	}
}

func TestVoucherApply_RecordsUsage(t *testing.T) {
	repo := baseVoucherRepo()
	svc := service.NewVoucherService(repo)
	userID := uuid.New().String()
	orderID := uuid.New().String()

	res, err := svc.Apply(context.Background(), "HEMAT10", userID, orderID, 100000, "p2p")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Valid || res.DiscountIDR != 10000 {
		t.Fatalf("expected valid 10000, got valid=%v discount=%d", res.Valid, res.DiscountIDR)
	}
	if repo.applyCalls != 1 {
		t.Fatalf("expected 1 ApplyUsage call, got %d", repo.applyCalls)
	}
}
