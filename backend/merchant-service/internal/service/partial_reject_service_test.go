package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tembus/merchant-service/internal/domain"
)

type mockOrderRepoForPartialReject struct {
	domain.MerchantOrderRepository
	order      *domain.StrukData
	recorded   bool
	eventError error
}

func (m *mockOrderRepoForPartialReject) GetOrderForStruk(context.Context, string, string) (*domain.StrukData, error) {
	return m.order, nil
}

func (m *mockOrderRepoForPartialReject) RecordOrderEvent(context.Context, string, string, string) error {
	m.recorded = true
	return m.eventError
}

func TestPartialRejectOrderValidatesSnapshotQuantity(t *testing.T) {
	mr := &mockMerchantRepoForStruk{getByUserID: func(context.Context, string) (*domain.Merchant, error) {
		return approvedMerchant(), nil
	}}
	or := &mockOrderRepoForPartialReject{order: &domain.StrukData{
		Status: "preparing",
		Items:  []domain.FoodOrderItemView{{MenuItemID: "menu-1", Quantity: 1}},
	}}
	svc := &merchantServiceImpl{merchantRepo: mr, orderRepo: or}
	_, err := svc.PartialRejectOrder(context.Background(), "user-1", "order-1", domain.PartialRejectOrderRequest{
		Items: []domain.PartialRejectItemRequest{{MenuItemID: "menu-1", Quantity: 2}},
	})
	if err == nil || !strings.Contains(err.Error(), "melebihi pesanan") {
		t.Fatalf("expected snapshot quantity validation, got %v", err)
	}
}

func TestPartialRejectOrderCallsRefundAndRecordsEvent(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/internal/refunds/items" {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"data":{"id":"refund-1","order_id":"order-1","amount_idr":15000,"refund_percentage":25,"status":"pending"}}`)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	t.Setenv("ORDER_SERVICE_URL", server.URL)

	mr := &mockMerchantRepoForStruk{getByUserID: func(context.Context, string) (*domain.Merchant, error) {
		return approvedMerchant(), nil
	}}
	or := &mockOrderRepoForPartialReject{order: &domain.StrukData{
		OrderID: "order-1", Status: "pending_merchant",
		Items: []domain.FoodOrderItemView{{MenuItemID: "menu-1", ItemName: "Nasi", Quantity: 1}},
	}}
	svc := &merchantServiceImpl{merchantRepo: mr, orderRepo: or}
	result, err := svc.PartialRejectOrder(context.Background(), "user-1", "order-1", domain.PartialRejectOrderRequest{
		Items: []domain.PartialRejectItemRequest{{MenuItemID: "menu-1", Quantity: 1, Reason: "stok habis"}},
	})
	if err != nil {
		t.Fatalf("partial reject failed: %v", err)
	}
	if result.RefundID != "refund-1" || result.AmountIDR != 15000 || !or.recorded {
		t.Fatalf("unexpected result/event: %+v recorded=%v", result, or.recorded)
	}
}
