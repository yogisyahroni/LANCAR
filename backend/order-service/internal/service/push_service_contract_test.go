package service

import (
	"fmt"
	"testing"
	"time"

	"tembus/order-service/internal/domain"
)

func TestEnrichPushDataIncludesOrderContext(t *testing.T) {
	updatedAt := time.Date(2026, time.September, 1, 12, 34, 56, 789, time.UTC)
	order := &domain.Order{
		ID:             "order-123",
		ServiceCode:    "food_delivery",
		ServiceSubType: "food_delivery",
		UpdatedAt:      updatedAt,
	}

	data := enrichPushData(order, map[string]string{"type": "order_updated"}, "customer_order_detail")

	if data["service_code"] != "food_delivery" {
		t.Fatalf("service_code = %q, want food_delivery", data["service_code"])
	}
	if data["service_sub_type"] != "food_delivery" {
		t.Fatalf("service_sub_type = %q, want food_delivery", data["service_sub_type"])
	}
	if data["event_version"] != fmt.Sprintf("%d", updatedAt.UnixNano()) {
		t.Fatalf("event_version = %q, want %d", data["event_version"], updatedAt.UnixNano())
	}
	if data["target"] != "customer_order_detail" {
		t.Fatalf("target = %q, want customer_order_detail", data["target"])
	}
	if data["deep_link"] != "tembus://orders/order-123" {
		t.Fatalf("deep_link = %q, want order detail deep link", data["deep_link"])
	}
}
