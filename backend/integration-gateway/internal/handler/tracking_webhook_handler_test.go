package handler

import "testing"

func TestNormalizePayloadPreservesProviderFields(t *testing.T) {
	h := &TrackingWebhookHandler{}
	event, err := h.normalizePayload("jne", []byte(`{"cnote_no":"JNE-1","status":"IN_TRANSIT","status_code":"S03","delivery_date":"2026-09-01T10:00:00Z","location":"Jakarta"}`))
	if err != nil {
		t.Fatalf("normalize JNE: %v", err)
	}
	if event.AWBNumber != "JNE-1" || event.Status != "IN_TRANSIT" {
		t.Fatalf("unexpected normalized event: %+v", event)
	}
	if event.RawStatus != "IN_TRANSIT" || event.RawCode != "S03" || event.RawLocation != "Jakarta" {
		t.Fatalf("raw provider fields lost: %+v", event)
	}
}

func TestNormalizePayloadUnknownIsSafeGenericState(t *testing.T) {
	h := &TrackingWebhookHandler{}
	event, err := h.normalizePayload("generic", []byte(`{"awb_number":"AWB-2","status":"DRIVER_WAITING_AT_HUB","description":"provider-specific state","location":"Bandung"}`))
	if err != nil {
		t.Fatalf("normalize generic: %v", err)
	}
	if event.Status != "UNKNOWN" || event.RawStatus != "DRIVER_WAITING_AT_HUB" || event.RawDescription == "" {
		t.Fatalf("unknown event was guessed or raw state lost: %+v", event)
	}
}
