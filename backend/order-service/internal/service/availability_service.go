package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"tembus/order-service/internal/domain"
	"time"
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

// UpdateRadius — FOOD-BIKE-029: set radius_max_km driver food delivery.
// Validasi nilai dropdown (1-20 km, sesuai CHECK constraint DB).
func (s *availabilityServiceImpl) UpdateRadius(ctx context.Context, courierID string, radiusKM int) error {
	allowed := map[int]bool{1: true, 2: true, 4: true, 6: true, 10: true, 12: true, 14: true, 16: true, 18: true, 20: true}
	if !allowed[radiusKM] {
		return fmt.Errorf("radius tidak valid: %d km (pilihan: 1,2,4,6,10,12,14,16,18,20)", radiusKM)
	}
	return s.repo.UpdateCourierRadius(ctx, courierID, radiusKM)
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
		// FOOD-2026-020: capability-safe technician discovery — filter motor/mobil
		// per service_sub_type via vehicleRestrictionMatrix (vehicle_validation.go).
		if !isVehicleCapable(courier.VehicleType, serviceSubType) {
			continue
		}
		// Defense-in-depth: radius per-courier untuk food (sepeda).
		if IsFoodDelivery(serviceSubType) {
			if courier.RadiusMaxKM > 0 && courier.DistanceKM > float64(courier.RadiusMaxKM) {
				continue
			}
		}

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

// progressiveSearchRadii validates the admin-managed radius stages before they
// are used by discovery. This keeps the database as the source of truth while
// preventing malformed configuration from widening the search unexpectedly.
func progressiveSearchRadii(service *domain.DeliveryServiceProduct) ([]float64, error) {
	if service == nil || len(service.SearchRadiiKM) == 0 {
		return nil, fmt.Errorf("search radius configuration is missing for delivery service")
	}

	radii := make([]float64, len(service.SearchRadiiKM))
	previous := 0.0
	for i, radius := range service.SearchRadiiKM {
		if math.IsNaN(radius) || math.IsInf(radius, 0) || radius <= previous || radius > 50 {
			return nil, fmt.Errorf("invalid search radius configuration at stage %d", i+1)
		}
		radii[i] = radius
		previous = radius
	}
	return radii, nil
}

// FindAvailableCouriersProgressive expands the discovery radius only when the
// current configured stage has no eligible couriers. The selected stage is
// returned to clients so the UI can explain the search state without guessing.
func (s *availabilityServiceImpl) FindAvailableCouriersProgressive(
	ctx context.Context,
	serviceSubType string,
	customerLat, customerLng float64,
) (*domain.NearbyCouriersResponse, error) {
	service, err := s.repo.GetDeliveryServiceByCode(ctx, serviceSubType)
	if err != nil {
		return nil, fmt.Errorf("failed to load search radius configuration: %w", err)
	}
	radii, err := progressiveSearchRadii(service)
	if err != nil {
		return nil, err
	}

	var last *domain.NearbyCouriersResponse
	for _, radius := range radii {
		result, err := s.FindAvailableCouriers(ctx, serviceSubType, customerLat, customerLng, radius)
		if err != nil {
			return nil, err
		}
		result.SearchRadiusKM = radius
		result.SearchRadiiKM = append([]float64(nil), radii...)
		last = result
		if len(result.Couriers) > 0 {
			now := time.Now().UTC()
			result.LastUpdatedAt = &now
			return result, nil
		}
	}

	if last == nil {
		last = &domain.NearbyCouriersResponse{SearchRadiiKM: append([]float64(nil), radii...)}
	}
	now := time.Now().UTC()
	last.LastUpdatedAt = &now
	return last, nil
}

// GetTambalBanHome — home tambal ban: 2 service products (motor/mobil) + nearby couriers.
func (s *availabilityServiceImpl) GetTambalBanHome(ctx context.Context, customerLat, customerLng float64) (*domain.TambalBanHomeResponse, error) {
	// Dua layanan tambal ban: motor & mobil
	codes := []struct {
		code         string
		vehicleLabel string
	}{
		{"tambal_ban_motor", "Motor"},
		{"tambal_ban_mobil", "Mobil"},
	}

	resp := &domain.TambalBanHomeResponse{Services: []domain.TambalBanServiceProduct{}}

	for _, c := range codes {
		prod, err := s.repo.GetDeliveryServiceByCode(ctx, c.code)
		if err != nil {
			// service product tidak ada — skip (jangan gagal total)
			continue
		}
		resp.Services = append(resp.Services, domain.TambalBanServiceProduct{
			Code:           prod.Code,
			Name:           prod.Name,
			Description:    prod.Name,
			BaseFareIDR:    prod.BaseFareIDR,
			PerKmIDR:       prod.PerKmIDR,
			PlatformFeeIDR: prod.PlatformFeeIDR,
			PlatformFeePct: prod.PlatformFeePct,
			IsEnabled:      true,
			VehicleLabel:   c.vehicleLabel,
		})
	}

	// Nearby couriers use the DB/Admin-managed progressive radius stages.
	nearby, err := s.FindAvailableCouriersProgressive(ctx, "tambal_ban_motor", customerLat, customerLng)
	if err != nil {
		return nil, fmt.Errorf("failed to find couriers: %w", err)
	}

	resp.Couriers = nearby.Couriers
	resp.Count = nearby.Count
	resp.PriceRange = nearby.PriceRange
	resp.SearchRadiusKM = nearby.SearchRadiusKM
	resp.SearchRadiiKM = nearby.SearchRadiiKM
	resp.LastUpdatedAt = nearby.LastUpdatedAt

	return resp, nil
}

// GetCourierDetail — detail teknisi by ID (tanpa filter radius).
// Fix 404 (2026-08-16): sebelumnya nyari lewat FindCouriersByCapability
// dengan lat/lng 0,0 → haversine dari (0,0) ≈ 11.000 km > radius 50 km
// → courier selalu terfilter.
func (s *availabilityServiceImpl) GetCourierDetail(ctx context.Context, courierID, serviceSubType string) (*domain.CourierDetail, error) {
	if serviceSubType == "" {
		serviceSubType = "tambal_ban_motor"
	}

	target, err := s.repo.GetCourierByID(ctx, courierID, serviceSubType, 0, 0)
	if err != nil {
		return nil, fmt.Errorf("courier not found: %w", err)
	}

	detail := &domain.CourierDetail{
		CourierID:             target.CourierID,
		CourierName:           target.CourierName,
		PhotoURL:              target.PhotoURL,
		Rating:                target.Rating,
		RatingCount:           target.RatingCount,
		VehicleType:           target.VehicleType,
		VehicleTypeCar:        target.VehicleTypeCar,
		VehicleBrand:          target.VehicleBrand,
		VehicleModel:          target.VehicleModel,
		VehiclePlate:          target.VehiclePlate,
		DistanceKM:            target.DistanceKM,
		ETAMinutes:            target.ETAMinutes,
		CourierServicePrice:   target.CourierServicePrice,
		RadiusMaxKM:           target.RadiusMaxKM,
		ServiceSubType:        serviceSubType,
		Status:                target.Status,
		StatusText:            target.StatusText,
		IsOnline:              true,
		AcceptanceRatePct:     target.AcceptanceRatePct,
		CompletionRatePct:     target.CompletionRatePct,
		OntimeRatePct:         target.OntimeRatePct,
		TotalDeliveries:       target.TotalDeliveries,
		Tier:                  target.Tier,
		IsVerified:            target.IsVerified,
		TrainingCount:         target.TrainingCount,
		VerifiedDocumentCount: target.VerifiedDocumentCount,
	}

	// Harga bounds (min/max dari courier_service_prices)
	if target.CourierServicePrice > 0 {
		detail.MinPrice = target.CourierServicePrice
		detail.MaxPrice = target.CourierServicePrice
	}

	return detail, nil
}

// SearchTambalBanCouriers — search teknisi by name; fallback ke nearby list.
func (s *availabilityServiceImpl) SearchTambalBanCouriers(ctx context.Context, query string, customerLat, customerLng float64, serviceSubType string) (*domain.NearbyCouriersResponse, error) {
	if serviceSubType == "" {
		serviceSubType = "tambal_ban_motor"
	}

	service, err := s.repo.GetDeliveryServiceByCode(ctx, serviceSubType)
	if err != nil {
		return nil, fmt.Errorf("failed to load search radius configuration: %w", err)
	}
	radii, err := progressiveSearchRadii(service)
	if err != nil {
		return nil, err
	}

	q := strings.ToLower(strings.TrimSpace(query))
	var nearby *domain.NearbyCouriersResponse
	for _, radius := range radii {
		candidate, searchErr := s.FindAvailableCouriers(ctx, serviceSubType, customerLat, customerLng, radius)
		if searchErr != nil {
			return nil, fmt.Errorf("failed to find couriers: %w", searchErr)
		}
		candidate.SearchRadiusKM = radius
		candidate.SearchRadiiKM = append([]float64(nil), radii...)
		nearby = candidate

		if q == "" || hasCourierNameMatch(candidate.Couriers, q) {
			break
		}
	}
	if nearby == nil {
		nearby = &domain.NearbyCouriersResponse{SearchRadiiKM: append([]float64(nil), radii...)}
	}

	var filtered []domain.NearbyCourier
	if q == "" {
		filtered = nearby.Couriers
	} else {
		for _, c := range nearby.Couriers {
			if strings.Contains(strings.ToLower(c.CourierName), q) {
				filtered = append(filtered, c)
			}
		}
	}

	// Recompute price range
	var minPrice, maxPrice, totalPrice int64
	var count int
	for _, c := range filtered {
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

	now := time.Now().UTC()
	return &domain.NearbyCouriersResponse{
		Couriers: filtered,
		Count:    len(filtered),
		PriceRange: domain.PriceRange{
			Min: minPrice,
			Max: maxPrice,
			Avg: avgPrice,
		},
		SearchRadiusKM: nearby.SearchRadiusKM,
		SearchRadiiKM:  nearby.SearchRadiiKM,
		LastUpdatedAt:  &now,
	}, nil
}

func hasCourierNameMatch(couriers []domain.NearbyCourier, query string) bool {
	for _, courier := range couriers {
		if strings.Contains(strings.ToLower(courier.CourierName), query) {
			return true
		}
	}
	return false
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
	return etaToNew <= 10
}
