package domain

import "testing"

func TestValidateOrderTransitionAllowsServiceLifecycle(t *testing.T) {
	tests := []struct {
		name     string
		current  OrderStatus
		target   OrderStatus
		actor    OrderActor
		category CanonicalServiceCategory
	}{
		{"parcel worker starts matching", StatusPendingAssignment, StatusSearching, OrderActorPlatform, CanonicalPackageOnDemand},
		{"food merchant starts preparation", StatusPendingMerchant, StatusPreparing, OrderActorMerchant, CanonicalFood},
		{"courier completes delivery", StatusDelivering, StatusDelivered, OrderActorCourier, CanonicalPackageOnDemand},
		{"carrier advances aggregator", StatusPickedUp, StatusDelivering, OrderActorCarrier, CanonicalAggregator},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := ValidateOrderTransition(tt.current, tt.target, tt.actor, tt.category); err != nil {
				t.Fatalf("expected transition to be allowed: %v", err)
			}
		})
	}
}

func TestValidateOrderTransitionRejectsUnauthorizedAndInvalidEdges(t *testing.T) {
	if err := ValidateOrderTransition(StatusDelivering, StatusDelivered, OrderActorCustomer, CanonicalPackageOnDemand); err == nil {
		t.Fatal("customer must not complete delivery")
	}
	if err := ValidateOrderTransition(StatusPendingPayment, StatusDelivered, OrderActorPlatform, CanonicalPackageOnDemand); err == nil {
		t.Fatal("pending payment must not jump directly to delivered")
	}
	if err := ValidateOrderTransition(StatusDelivered, StatusDelivering, OrderActorPlatform, CanonicalPackageOnDemand); err == nil {
		t.Fatal("delivered must remain terminal")
	}
	if err := ValidateOrderTransition(StatusPendingMerchant, StatusPreparing, OrderActorMerchant, CanonicalPackageOnDemand); err == nil {
		t.Fatal("merchant preparation is only valid for food")
	}
}

func TestValidateOrderTransitionSameStateIsIdempotent(t *testing.T) {
	if err := ValidateOrderTransition(StatusDelivered, StatusDelivered, OrderActorCustomer, CanonicalPackageOnDemand); err != nil {
		t.Fatalf("same-state replay should be idempotent: %v", err)
	}
}
