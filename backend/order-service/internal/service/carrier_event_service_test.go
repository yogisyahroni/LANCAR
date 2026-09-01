package service

import (
	"tembus/order-service/internal/domain"
	"testing"
)

func TestCanonicalCarrierStatusDoesNotGuessUnknown(t *testing.T) {
	if status, ok := canonicalOrderStatus("PROVIDER_ONLY_STATE"); ok || status != "" {
		t.Fatalf("unknown provider state must remain unmapped: %q %v", status, ok)
	}
}

func TestCarrierStatusRankPreventsRegression(t *testing.T) {
	if statusCanAdvance(domain.StatusDelivering, domain.StatusPickedUp) {
		t.Fatal("picked_up must not regress delivering")
	}
	if !statusCanAdvance(domain.StatusPickedUp, domain.StatusDelivering) {
		t.Fatal("delivering should advance picked_up")
	}
}
