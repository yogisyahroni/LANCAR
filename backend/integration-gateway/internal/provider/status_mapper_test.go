package provider

import "testing"

func TestStatusMapperPreservesProviderNativeFieldsWithoutGuessing(t *testing.T) {
	tests := []struct {
		name, provider, raw, code, want string
	}{
		{name: "jnt native delivered code", provider: "jnt", raw: "SIGNED", code: "D01", want: "DELIVERED"},
		{name: "jne textual transit", provider: "jne", raw: "IN_TRANSIT", want: "IN_TRANSIT"},
		{name: "sorting center", provider: "jnt", raw: "SORTING", want: "AT_SORTING_CENTER"},
		{name: "manifest maps to canonical target", provider: "jne", raw: "MANIFESTED", want: "AWB_ISSUED"},
		{name: "unknown stays unknown", provider: "jne", raw: "ARRIVED_AT_SECRET_HUB", code: "X-999", want: "UNKNOWN"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeCarrierStatusForProvider(tt.provider, tt.raw, tt.code); got != tt.want {
				t.Fatalf("normalizeCarrierStatusForProvider() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestGenericAdapterCopiesProviderFields(t *testing.T) {
	event, err := (genericWebhookAdapter{code: "sandbox"}).Normalize([]byte(`{
		"awb_number":"AWB-1",
		"status":"ARRIVED_AT_SECRET_HUB",
		"status_code":"X-999",
		"description":"Native carrier detail",
		"location":"Bandung",
		"occurred_at":"2026-09-01T10:00:00Z"
	}`))
	if err != nil {
		t.Fatalf("normalize generic webhook: %v", err)
	}
	if event.Status != "UNKNOWN" || event.CanonicalStatus != "UNKNOWN" {
		t.Fatalf("unknown status was guessed: %+v", event)
	}
	if event.ProviderStatus != "ARRIVED_AT_SECRET_HUB" || event.ProviderCode != "X-999" || event.ProviderLocation != "Bandung" {
		t.Fatalf("provider fields were not retained: %+v", event)
	}
}
