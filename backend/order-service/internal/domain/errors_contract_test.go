package domain

import "testing"

func TestRecoverableErrorContractCoversRequiredCodes(t *testing.T) {
	codes := []string{
		"REQUOTE_REQUIRED", "OUT_OF_SERVICE_AREA", "NO_COURIER", "PROVIDER_UNAVAILABLE",
		"ITEM_UNAVAILABLE", "INVALID_TRANSITION", "PAYMENT_PENDING", "PROOF_REQUIRED",
		"HANDOFF_INVALID", "SCHEDULE_INVALID", "CAPABILITY_MISMATCH", "CARRIER_RATE_EXPIRED",
		"CARRIER_EVENT_UNKNOWN",
	}
	for _, code := range codes {
		descriptor, ok := RecoverableErrorForCode(code)
		if !ok || descriptor.Action == "" || descriptor.Code != code {
			t.Fatalf("missing recoverable descriptor for %s: %+v", code, descriptor)
		}
	}
}
