package domain

import "testing"

func TestFoodOrderLifecycleAllowsCanonicalHappyPath(t *testing.T) {
	steps := []struct {
		name  string
		from  OrderStatus
		to    OrderStatus
		actor OrderActor
	}{
		{"payment activates merchant order", StatusPendingPayment, StatusPendingMerchant, OrderActorPlatform},
		{"merchant accepts and starts preparation", StatusPendingMerchant, StatusPreparing, OrderActorMerchant},
		{"platform starts courier search", StatusPreparing, StatusSearching, OrderActorPlatform},
		{"platform assigns courier", StatusSearching, StatusAssigned, OrderActorPlatform},
		{"courier accepts assignment", StatusAssigned, StatusAccepted, OrderActorCourier},
		{"courier arrives at merchant", StatusAccepted, StatusPickupArrived, OrderActorCourier},
		{"courier completes handoff", StatusPickupArrived, StatusPickedUp, OrderActorCourier},
		{"courier starts delivery", StatusPickedUp, StatusDelivering, OrderActorCourier},
		{"courier completes delivery", StatusDelivering, StatusDelivered, OrderActorCourier},
	}

	current := StatusPendingPayment
	for _, step := range steps {
		t.Run(step.name, func(t *testing.T) {
			if current != step.from {
				t.Fatalf("test sequence drifted: got %s, want %s", current, step.from)
			}
			if err := ValidateOrderTransition(step.from, step.to, step.actor, CanonicalFood); err != nil {
				t.Fatalf("food transition %s -> %s rejected: %v", step.from, step.to, err)
			}
			current = step.to
		})
	}
	if current != StatusDelivered {
		t.Fatalf("happy path ended at %s, want delivered", current)
	}
}

func TestFoodOrderStateMachineCoversRecoveryAndScheduleEdges(t *testing.T) {
	tests := []struct {
		name  string
		from  OrderStatus
		to    OrderStatus
		actor OrderActor
		valid bool
	}{
		{"scheduled order activates", StatusScheduled, StatusPendingMerchant, OrderActorPlatform, true},
		{"no courier can be retried", StatusNoCourierFound, StatusSearching, OrderActorPlatform, true},
		{"merchant can reject before preparation", StatusPendingMerchant, StatusCancelled, OrderActorMerchant, true},
		{"customer cannot complete delivery", StatusDelivering, StatusDelivered, OrderActorCustomer, false},
		{"preparation cannot skip courier search", StatusPreparing, StatusDelivered, OrderActorPlatform, false},
		{"terminal food order cannot be replayed backward", StatusDelivered, StatusDelivering, OrderActorPlatform, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOrderTransition(tt.from, tt.to, tt.actor, CanonicalFood)
			if tt.valid && err != nil {
				t.Fatalf("expected transition to be valid: %v", err)
			}
			if !tt.valid && err == nil {
				t.Fatalf("expected transition %s -> %s to be rejected", tt.from, tt.to)
			}
		})
	}
}

func TestFoodOrderStateMachineTreatsDuplicateStateEventAsIdempotent(t *testing.T) {
	if err := ValidateOrderTransition(StatusAccepted, StatusAccepted, OrderActorCourier, CanonicalFood); err != nil {
		t.Fatalf("duplicate state event must be idempotent: %v", err)
	}
}
