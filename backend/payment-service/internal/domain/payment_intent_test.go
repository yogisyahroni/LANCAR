package domain

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestPaymentIntentTransitionMatrixRejectsLateSuccess(t *testing.T) {
	if !CanTransition(PaymentIntentCreated, PaymentIntentProcessing) {
		t.Fatal("created must transition to processing")
	}
	if CanTransition(PaymentIntentCancelled, PaymentIntentPaid) {
		t.Fatal("cancelled intent must not be revived")
	}
	intent := &PaymentIntent{ID: uuid.New(), State: PaymentIntentCancelled, Version: 2}
	err := intent.ApplyEvent(PaymentIntentEvent{IntentID: intent.ID, EventID: "provider-1", NormalizedState: PaymentIntentPaid, OccurredAt: time.Now().UTC()})
	if !errors.Is(err, ErrPaymentIntentTerminal) {
		t.Fatalf("expected terminal error, got %v", err)
	}
}

func TestPaymentIntentPreservesRawStatusAndReference(t *testing.T) {
	intent := &PaymentIntent{ID: uuid.New(), State: PaymentIntentProcessing, Version: 1}
	err := intent.ApplyEvent(PaymentIntentEvent{
		IntentID: intent.ID, EventID: "provider-1", ProviderRawStatus: "settlement",
		ProviderReference: "native-123", NormalizedState: PaymentIntentPaid, OccurredAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if intent.ProviderRawStatus != "settlement" || intent.ProviderReference != "native-123" || intent.State != PaymentIntentPaid {
		t.Fatalf("provider evidence was not preserved: %+v", intent)
	}
}
