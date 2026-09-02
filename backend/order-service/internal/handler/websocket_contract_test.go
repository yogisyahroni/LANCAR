package handler

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNormalizeRealtimeEventAddsVersionAndTopic(t *testing.T) {
	now := time.Date(2026, 9, 2, 10, 0, 0, 123, time.UTC)
	payload, index, ok := normalizeRealtimeEvent("order.updates", []byte(`{"order_id":"order-1","user_id":"user-1"}`), now)
	if !ok || index.OrderID != "order-1" || index.UserID != "user-1" {
		t.Fatalf("normalize result = ok:%v index:%+v", ok, index)
	}
	var event map[string]any
	if err := json.Unmarshal(payload, &event); err != nil {
		t.Fatal(err)
	}
	if event["event_type"] != "order.updates" || event["event_version"] != "1788343200000000123" {
		t.Fatalf("normalized event = %#v", event)
	}
}

func TestNormalizeRealtimeEventRejectsUnaddressablePayload(t *testing.T) {
	if _, _, ok := normalizeRealtimeEvent("order.updates", []byte(`{"status":"delivered"}`), time.Now()); ok {
		t.Fatal("expected payload without order/user target to be rejected")
	}
}
