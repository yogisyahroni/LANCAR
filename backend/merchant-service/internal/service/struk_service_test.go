package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

var errStrukNotFound = errors.New("order tidak ditemukan atau bukan milik merchant")

// ── mock minimal (embed interface → override method yang dipakai) ──

type mockMerchantRepoForStruk struct {
	domain.MerchantRepository
	getByUserID func(ctx context.Context, userID string) (*domain.Merchant, error)
}

func (m *mockMerchantRepoForStruk) GetByUserID(ctx context.Context, userID string) (*domain.Merchant, error) {
	return m.getByUserID(ctx, userID)
}

type mockOrderRepoForStruk struct {
	domain.MerchantOrderRepository
	getOrderForStruk func(ctx context.Context, merchantID, orderID string) (*domain.StrukData, error)
}

func (m *mockOrderRepoForStruk) GetOrderForStruk(ctx context.Context, merchantID, orderID string) (*domain.StrukData, error) {
	return m.getOrderForStruk(ctx, merchantID, orderID)
}

// ── fixtures ──

func approvedMerchant() *domain.Merchant {
	return &domain.Merchant{ID: "merchant-1", UserID: "user-1", VerificationStatus: "approved", NamaToko: "Warung Tembus"}
}

func sampleStruk() *domain.StrukData {
	return &domain.StrukData{
		OrderID:        "order-1",
		OrderNumber:    "LCR-F-001",
		Status:         "preparing",
		MerchantName:   "Warung Tembus",
		HandoverToken:  "HO-TOKEN-001",
		SubtotalIDR:    30000,
		DeliveryFeeIDR: 5000,
		TotalPriceIDR:  35000,
		Items: []domain.FoodOrderItemView{
			{ItemName: "Nasi Goreng", Quantity: 2, ItemPrice: 15000, Subtotal: 30000},
		},
	}
}

func newStrukTestService(merchant *domain.Merchant, struk *domain.StrukData, repoErr error) *merchantServiceImpl {
	mr := &mockMerchantRepoForStruk{getByUserID: func(ctx context.Context, userID string) (*domain.Merchant, error) {
		if merchant == nil {
			return nil, nil
		}
		return merchant, nil
	}}
	or := &mockOrderRepoForStruk{getOrderForStruk: func(ctx context.Context, merchantID, orderID string) (*domain.StrukData, error) {
		if repoErr != nil {
			return nil, repoErr
		}
		return struk, nil
	}}
	return &merchantServiceImpl{merchantRepo: mr, orderRepo: or}
}

// ── tests ──

func TestGetStruk_MerchantBelumTerdaftar(t *testing.T) {
	svc := newStrukTestService(nil, sampleStruk(), nil)
	_, err := svc.GetStruk(context.Background(), "user-1", "order-1")
	if err == nil || !strings.Contains(err.Error(), "belum terdaftar") {
		t.Fatalf("expected 'belum terdaftar' error, got: %v", err)
	}
}

func TestGetStruk_MerchantBelumDisetujui(t *testing.T) {
	m := approvedMerchant()
	m.VerificationStatus = "pending"
	svc := newStrukTestService(m, sampleStruk(), nil)
	_, err := svc.GetStruk(context.Background(), "user-1", "order-1")
	if err == nil || !strings.Contains(err.Error(), "belum disetujui") {
		t.Fatalf("expected 'belum disetujui' error, got: %v", err)
	}
}

func TestGetStruk_SuksesDenganQR(t *testing.T) {
	svc := newStrukTestService(approvedMerchant(), sampleStruk(), nil)
	struk, err := svc.GetStruk(context.Background(), "user-1", "order-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if struk.QRCodeDataURI == "" || !strings.HasPrefix(struk.QRCodeDataURI, "data:image/png;base64,") {
		t.Fatalf("QR code data URI tidak valid: %q", struk.QRCodeDataURI)
	}
	if struk.TotalPriceIDR != 35000 || struk.SubtotalIDR != 30000 {
		t.Fatalf("struk price tidak sesuai: %+v", struk)
	}
}

func TestGetStruk_ErrorRepoDipropagasi(t *testing.T) {
	svc := newStrukTestService(approvedMerchant(), nil, errStrukNotFound)
	_, err := svc.GetStruk(context.Background(), "user-1", "order-1")
	if err == nil || !strings.Contains(err.Error(), "bukan milik merchant") {
		t.Fatalf("expected 'bukan milik merchant' error, got: %v", err)
	}
}
