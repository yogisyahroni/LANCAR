package worker

import "testing"

func TestCommunicationDeliveryPermanentProviderErrors(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want bool
	}{
		{name: "missing provider is explicit permanent failure", msg: "notification_provider_push_not_configured", want: true},
		{name: "invalid token is permanent", msg: "provider rejected INVALID_TOKEN", want: true},
		{name: "bad request status is permanent", msg: "notification_provider_rejected_push_status_400", want: true},
		{name: "provider outage is retryable", msg: "notification_provider_delivery_failed: dial timeout", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isPermanentProviderError(tt.msg); got != tt.want {
				t.Fatalf("isPermanentProviderError(%q) = %v, want %v", tt.msg, got, tt.want)
			}
		})
	}
}
