package service

import (
	"context"
	"testing"

	"tembus/order-service/internal/domain"
)

type matchingAvailabilityStub struct {
	domain.AvailabilityRepository
	state          *domain.CourierAvailabilityState
	stateByCourier map[string]*domain.CourierAvailabilityState
	capable        []*domain.NearbyCourier
	distanceKM     float64
	remainingMins  int
	stateLookupErr error
}

func (s *matchingAvailabilityStub) FindCouriersByCapability(context.Context, string, float64, float64, float64) ([]*domain.NearbyCourier, error) {
	return s.capable, nil
}

func (s *matchingAvailabilityStub) GetAvailabilityState(_ context.Context, courierID string) (*domain.CourierAvailabilityState, error) {
	// This stub intentionally supports both a default row and per-courier rows.
	// The production repository returns one authoritative row per courier.
	return s.getState(courierID)
}

func (s *matchingAvailabilityStub) getState(courierID string) (*domain.CourierAvailabilityState, error) {
	if state, ok := s.stateByCourier[courierID]; ok {
		return state, nil
	}
	return s.state, s.stateLookupErr
}

func (s *matchingAvailabilityStub) EstimateDistanceKM(context.Context, float64, float64, float64, float64) (float64, error) {
	return s.distanceKM, nil
}

func (s *matchingAvailabilityStub) GetActiveOrderRemainingMinutes(context.Context, string) (int, error) {
	return s.remainingMins, nil
}

func TestMatchingCapabilityCode_UsesPersistedOrderContract(t *testing.T) {
	tests := []struct {
		name  string
		order *domain.Order
		want  string
	}{
		{name: "food subtype", order: &domain.Order{ServiceSubType: "food_delivery"}, want: "food_delivery"},
		{name: "legacy package category", order: &domain.Order{ServiceCategory: domain.CanonicalPackageOnDemand}, want: "on_demand"},
		{name: "unknown record", order: &domain.Order{Model: "legacy_unknown"}, want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchingCapabilityCode(tt.order); got != tt.want {
				t.Fatalf("matchingCapabilityCode() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFilterEligibleDispatchCouriers_RejectsBusyAndKeepsConditional(t *testing.T) {
	order := &domain.Order{
		ID:             "order-1",
		ServiceSubType: "food_delivery",
		PickupLat:      -6.2,
		PickupLng:      106.8,
	}
	stub := &matchingAvailabilityStub{
		capable: []*domain.NearbyCourier{
			{CourierID: "busy"},
			{CourierID: "conditional"},
		},
		distanceKM:    1.2,
		remainingMins: 20,
		stateByCourier: map[string]*domain.CourierAvailabilityState{
			"busy":        {CurrentState: domain.AvailabilityStateInTransit},
			"conditional": {CurrentState: domain.AvailabilityStateNavigatingToPickup},
		},
	}
	service := &orderServiceImpl{availabilityRepo: stub}
	got := service.filterEligibleDispatchCouriers(context.Background(), order, []string{"busy", "conditional"}, 3)
	if len(got) != 1 || got[0] != "conditional" {
		t.Fatalf("eligible couriers = %v, want [conditional]", got)
	}
}

func TestCourierAvailableForMatching_AllowsOnlyIdleOrSafeConditional(t *testing.T) {
	ctx := context.Background()
	service := &orderServiceImpl{availabilityRepo: &matchingAvailabilityStub{
		state:         &domain.CourierAvailabilityState{CurrentState: domain.AvailabilityStateNavigatingToPickup},
		distanceKM:    1.2,
		remainingMins: 20,
	}}
	if !service.courierAvailableForMatching(ctx, "courier-1", -6.2, 106.8) {
		t.Fatal("safe conditional courier should be eligible")
	}

	service.availabilityRepo = &matchingAvailabilityStub{
		state: &domain.CourierAvailabilityState{CurrentState: domain.AvailabilityStateInTransit},
	}
	if service.courierAvailableForMatching(ctx, "courier-2", -6.2, 106.8) {
		t.Fatal("in-transit courier must not be eligible")
	}
}
