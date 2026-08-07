package service

import (
	"context"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

// ── mock order repo untuk edit (embed interface → override) ──

type mockOrderRepoForEdit struct {
	domain.MerchantOrderRepository
	orderEdit         func(ctx context.Context, merchantID, orderID string) (*domain.OrderEditData, error)
	replaceItems      func(ctx context.Context, orderID string, items []domain.FoodOrderItemSnapshot, subtotal, platformFee, total int64) error
	recordEvent       func(ctx context.Context, orderID, eventType, description string) error
}

func (m *mockOrderRepoForEdit) GetOrderForEdit(ctx context.Context, merchantID, orderID string) (*domain.OrderEditData, error) {
	return m.orderEdit(ctx, merchantID, orderID)
}

func (m *mockOrderRepoForEdit) ReplaceOrderItems(ctx context.Context, orderID string, items []domain.FoodOrderItemSnapshot, subtotal, platformFee, total int64) error {
	return m.replaceItems(ctx, orderID, items, subtotal, platformFee, total)
}

func (m *mockOrderRepoForEdit) RecordOrderEvent(ctx context.Context, orderID, eventType, description string) error {
	if m.recordEvent != nil {
		return m.recordEvent(ctx, orderID, eventType, description)
	}
	return nil
}

// ── mock menu repo ──

type mockMenuRepoForEdit struct {
	domain.MenuItemRepository
	getByID func(ctx context.Context, id string) (*domain.MenuItem, error)
}

func (m *mockMenuRepoForEdit) GetByID(ctx context.Context, id string) (*domain.MenuItem, error) {
	return m.getByID(ctx, id)
}

func menuItem(id string, merchantID string, nama string, harga int64, available bool) *domain.MenuItem {
	return &domain.MenuItem{ID: id, MerchantID: merchantID, Nama: nama, Harga: harga, IsAvailable: available}
}

// pendingMerchantOrder — order status pending_merchant subtotal 30000.
func pendingMerchantOrder() *domain.OrderEditData {
	return &domain.OrderEditData{
		ID: "order-1", Status: "pending_merchant",
		SubtotalOldIDR: 30000, DeliveryFeeIDR: 5000,
		PlatformFeeIDR: 3000, PlatformFeePct: 10, DiscountIDR: 0,
		Items: []domain.FoodOrderItemView{
			{ItemName: "Nasi Goreng", Quantity: 2, ItemPrice: 15000, Subtotal: 30000},
		},
	}
}

func newEditTestService(merchant *domain.Merchant, editData *domain.OrderEditData, items map[string]*domain.MenuItem, replaceErr error) *merchantServiceImpl {
	mr := &mockMerchantRepoForStruk{getByUserID: func(ctx context.Context, userID string) (*domain.Merchant, error) {
		if merchant == nil {
			return nil, nil
		}
		return merchant, nil
	}}
	or := &mockOrderRepoForEdit{
		orderEdit: func(ctx context.Context, merchantID, orderID string) (*domain.OrderEditData, error) {
			if editData == nil {
				return nil, errStrukNotFound
			}
			return editData, nil
		},
		replaceItems: func(ctx context.Context, orderID string, items []domain.FoodOrderItemSnapshot, subtotal, platformFee, total int64) error {
			return replaceErr
		},
	}
	mnr := &mockMenuRepoForEdit{getByID: func(ctx context.Context, id string) (*domain.MenuItem, error) {
		if it, ok := items[id]; ok {
			return it, nil
		}
		return nil, nil
	}}
	return &merchantServiceImpl{merchantRepo: mr, menuRepo: mnr, orderRepo: or}
}

func editReq(qty int) domain.EditOrderItemsRequest {
	return domain.EditOrderItemsRequest{
		Items: []domain.EditOrderItemRequest{{MenuID: "menu-1", Quantity: qty, Notes: ""}},
	}
}

// ── tests ──

func TestEditOrderItems_MerchantBelumTerdaftar(t *testing.T) {
	svc := newEditTestService(nil, pendingMerchantOrder(), nil, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(1))
	if err == nil || !strings.Contains(err.Error(), "belum terdaftar") {
		t.Fatalf("expected 'belum terdaftar', got: %v", err)
	}
}

func TestEditOrderItems_MerchantPending(t *testing.T) {
	m := approvedMerchant()
	m.VerificationStatus = "pending"
	svc := newEditTestService(m, pendingMerchantOrder(), nil, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(1))
	if err == nil || !strings.Contains(err.Error(), "belum disetujui") {
		t.Fatalf("expected 'belum disetujui', got: %v", err)
	}
}

func TestEditOrderItems_ItemsKosong(t *testing.T) {
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), nil, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", domain.EditOrderItemsRequest{})
	if err == nil || !strings.Contains(err.Error(), "items wajib") {
		t.Fatalf("expected 'items wajib diisi', got: %v", err)
	}
}

func TestEditOrderItems_QuantityNol(t *testing.T) {
	items := map[string]*domain.MenuItem{"menu-1": menuItem("menu-1", "merchant-1", "Nasi Goreng", 15000, true)}
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), items, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(0))
	if err == nil || !strings.Contains(err.Error(), "minimal 1") {
		t.Fatalf("expected qty error, got: %v", err)
	}
}

func TestEditOrderItems_NilaiNaikDitolak(t *testing.T) {
	// Subtotal lama 30000; qty 3 × 15000 = 45000 > 30000 → tolak (Grab pattern)
	items := map[string]*domain.MenuItem{"menu-1": menuItem("menu-1", "merchant-1", "Nasi Goreng", 15000, true)}
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), items, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(3))
	if err == nil || !strings.Contains(err.Error(), "tidak boleh melebihi") {
		t.Fatalf("expected 'tidak boleh melebihi', got: %v", err)
	}
}

func TestEditOrderItems_ItemBukanMilikMerchant(t *testing.T) {
	// menu-1 milik merchant LAIN (merchant-99) — tidak boleh dipakai
	items := map[string]*domain.MenuItem{"menu-1": menuItem("menu-1", "merchant-99", "Menu Orang Lain", 15000, true)}
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), items, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(1))
	if err == nil || !strings.Contains(err.Error(), "bukan milik merchant") {
		t.Fatalf("expected 'bukan milik merchant', got: %v", err)
	}
}

func TestEditOrderItems_ItemTidakTersedia(t *testing.T) {
	items := map[string]*domain.MenuItem{"menu-1": menuItem("menu-1", "merchant-1", "Nasi Goreng", 15000, false)}
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), items, nil)
	_, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(1))
	if err == nil || !strings.Contains(err.Error(), "tidak tersedia") {
		t.Fatalf("expected 'tidak tersedia', got: %v", err)
	}
}

func TestEditOrderItems_SuksesTurunDenganRecalc(t *testing.T) {
	// Subtotal lama 30000 → qty 1 × 15000 = 15000 (turun).
	// Platform fee 10% × 15000 = 1500. Total = 15000 + 5000 + 1500 = 21500.
	items := map[string]*domain.MenuItem{"menu-1": menuItem("menu-1", "merchant-1", "Nasi Goreng", 15000, true)}
	svc := newEditTestService(approvedMerchant(), pendingMerchantOrder(), items, nil)
	res, err := svc.EditOrderItems(context.Background(), "user-1", "order-1", editReq(1))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.SubtotalIDR != 15000 || res.PlatformFeeIDR != 1500 || res.TotalIDR != 21500 {
		t.Fatalf("recalc salah: subtotal=%d platform=%d total=%d", res.SubtotalIDR, res.PlatformFeeIDR, res.TotalIDR)
	}
}
