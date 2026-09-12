package domain

import "testing"

func TestChargebackLifecycleDoesNotReopenTerminalOutcome(t *testing.T) {
	if !CanTransitionChargeback(ChargebackReceived, ChargebackUnderReview) {
		t.Fatal("received chargeback should enter review")
	}
	if !CanTransitionChargeback(ChargebackEvidenceSubmitted, ChargebackLost) {
		t.Fatal("evidence-submitted chargeback should resolve lost")
	}
	if CanTransitionChargeback(ChargebackLost, ChargebackUnderReview) {
		t.Fatal("lost chargeback must not reopen")
	}
	if !CanTransitionChargeback(ChargebackLost, ChargebackClosed) {
		t.Fatal("lost chargeback should be closeable")
	}
}
