package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"tembus/order-service/internal/domain"
)

type availabilityServiceImpl struct {
	repo domain.AvailabilityRepository
}

func NewAvailabilityService(repo domain.AvailabilityRepository) domain.AvailabilityService {
	return &availabilityServiceImpl{repo: repo}
}

func (s *availabilityServiceImpl) UpdateCourierState(ctx context.Context, courierID, newState string, orderID *string) error {
	state := &domain.CourierAvailabilityState{
		CourierID:          courierID,
		CurrentState:       newState,
		ActiveOrderID:      orderID,
		LastLocationUpdate: nil,
	}

	return s.repo.UpsertAvailabilityState(ctx, state)
}

func (s *availabilityServiceImpl) GetCourierAvailability(ctx context.Context, courierID string) (*domain.CourierAvailabilityState, error) {
	return s.repo.GetAvailabilityState(ctx, courierID)
}

// FindAvailableCouriers returns couriers that can accept new orders.
// Rules:
// - IDLE: always available
// - NAVIGATING_TO_PICKUP: conditionally available (< 2km from new customer, > 15min remaining, < 10min ETA)
// - AT_PICKUP, ON_SITE, IN_TRANSIT, RETURNING: never available
func (s *availabilityServiceImpl) FindAvailableCouriers(
	ctx context.Context,
	serviceSubType string,
	customerLat, customerLng, radiusKM float64,
) (*domain.NearbyCouriersResponse, error) {
	// 1. Find all couriers with capability for this service
	allCouriers, err := s.repo.FindCouriersByCapability(ctx, serviceSubType, radiusKM, customerLat, customerLng)
	if err != nil {
		return nil, fmt.Errorf("failed to find couriers: %w", err)
	}

	var available []domain.NearbyCourier

	for _, courier := range allCouriers {
		state, err := s.repo.GetAvailabilityState(ctx, courier.CourierID)
		if err != nil {
			// No state record = treat as idle
			courier.Status = "available"
			courier.StatusText = "Siap melayani"
			courier.ETAMinutes = 0
			available = append(available, *courier)
			continue
		}

		switch state.CurrentState {
		case domain.AvailabilityStateIdle:
			courier.Status = "available"
			courier.StatusText = "Siap melayani"
			courier.ETAMinutes = 0
			available = append(available, *courier)

		case domain.AvailabilityStateNavigatingToPickup:
			if s.canAcceptConditional(ctx, state, customerLat, customerLng) {
				eta, _ := s.repo.EstimateDistanceKM(ctx, state.Latitude, state.Longitude, customerLat, customerLng)
				etaMinutes := int(math.Ceil(eta * 2.5)) // rough: 2.5 min per km in city

				courier.Status = "conditional"
				courier.StatusText = fmt.Sprintf("Dalam perjalanan (~%d menit tiba)", etaMinutes)
				courier.ETAMinutes = etaMinutes
				available = append(available, *courier)
			}
			// else: not available

		case domain.AvailabilityStateAtPickup,
			domain.AvailabilityStateOnSite,
			domain.AvailabilityStateInTransit,
			domain.AvailabilityStateReturning:
			// Not available — skip
		}
	}

	// Sort: available first, then by distance
	sort.Slice(available, func(i, j int) bool {
		if available[i].Status == "available" && available[j].Status != "available" {
			return true
		}
		if available[i].Status != "available" && available[j].Status == "available" {
			return false
		}
		return available[i].DistanceKM < available[j].DistanceKM
	})

	// Compute price range
	var minPrice, maxPrice, totalPrice int64
	var count int
	for _, c := range available {
		if c.CourierServicePrice > 0 {
			if minPrice == 0 || c.CourierServicePrice < minPrice {
				minPrice = c.CourierServicePrice
			}
			if c.CourierServicePrice > maxPrice {
				maxPrice = c.CourierServicePrice
			}
			totalPrice += c.CourierServicePrice
			count++
		}
	}

	var avgPrice int64
	if count > 0 {
		avgPrice = totalPrice / int64(count)
	}

	return &domain.NearbyCouriersResponse{
		Couriers: available,
		Count:    len(available),
		PriceRange: domain.PriceRange{
			Min: minPrice,
			Max: maxPrice,
			Avg: avgPrice,
		},
	}, nil
}

// canAcceptConditional checks if a courier in NAVIGATING state can accept a new order
func (s *availabilityServiceImpl) canAcceptConditional(ctx context.Context, state *domain.CourierAvailabilityState, customerLat, customerLng float64) bool {
	// Rule 1: Distance to new customer must be < 2km
	distToNew, err := s.repo.EstimateDistanceKM(ctx, state.Latitude, state.Longitude, customerLat, customerLng)
	if err != nil || distToNew > 2.0 {
		return false
	}

	// Rule 2: Must have at least 15 minutes remaining for current order
	remainingMinutes, err := s.repo.GetActiveOrderRemainingMinutes(ctx, state.CourierID)
	if err != nil || remainingMinutes < 15 {
		return false
	}

	// Rule 3: ETA to new customer must be < 10 minutes
	etaToNew := int(math.Ceil(distToNew * 2.5)) // rough: 2.5 min per km
	if etaToNew > 10 {
		return false
	}

	return true
}
