package service

import (
	"context"
	"fmt"
	"lancar/order-service/internal/domain"
	"math"
	"time"

	"github.com/google/uuid"
)

type pricingServiceImpl struct {
	pricingRepo domain.PricingRepository
	mapsRepo    domain.MapsRepository
	redisRepo   domain.RedisRepository
}

func NewPricingService(p domain.PricingRepository, m domain.MapsRepository, r domain.RedisRepository) domain.PricingService {
	return &pricingServiceImpl{
		pricingRepo: p,
		mapsRepo:    m,
		redisRepo:   r,
	}
}

func (s *pricingServiceImpl) Estimate(ctx context.Context, req domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {
	// 1. Get Distance and Duration from Google Maps
	distKM, durMin, originAddr, destAddr, err := s.mapsRepo.GetDistanceMatrix(ctx, req.PickupLat, req.PickupLng, req.DropoffLat, req.DropoffLng)
	if err != nil {
		return nil, fmt.Errorf("maps error: %w", err)
	}

	// 2. Get Pricing Configuration
	config, err := s.pricingRepo.GetActiveConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("config error: %w", err)
	}

	// 3. Calculate Volumetric Weight
	volWeight := (req.Length * req.Width * req.Height) / config.VolumetricDiv
	effectiveWeight := math.Max(req.Weight, volWeight)

	// 4. Calculate Base Prices
	baseFare := config.BaseFare
	distanceFare := int64(distKM * float64(config.PerKMFare))
	weightFare := int64(effectiveWeight * float64(config.PerKGFare))

	subtotal := baseFare + distanceFare + weightFare
	if subtotal < config.MinFare {
		subtotal = config.MinFare
	}

	// 5. Apply Dynamic Multiplier (Surge)
	multiplier, err := s.redisRepo.GetMultiplier(ctx)
	if err != nil {
		multiplier = 1.0 // Fallback
	}

	dynamicPrice := int64(float64(subtotal) * (multiplier - 1.0))
	totalPrice := int64(float64(subtotal) * multiplier)

	// 6. Create Response
	resp := &domain.PricingEstimateResponse{
		EstimateID:             uuid.New().String(),
		PickupAddress:          originAddr,
		DropoffAddress:         destAddr,
		DistanceKM:             distKM,
		DurationMin:            durMin,
		BasePriceIDR:           subtotal,
		VolumetricSurchargeIDR: weightFare, // Simplification: weight is part of surcharge
		DynamicPriceIDR:        dynamicPrice,
		TotalPriceIDR:          totalPrice,
		ExpiresAt:              time.Now().Add(10 * time.Minute),
		PickupLat:              req.PickupLat,
		PickupLng:              req.PickupLng,
		DropoffLat:             req.DropoffLat,
		DropoffLng:             req.DropoffLng,
	}

	// 7. Cache in Redis
	if err := s.redisRepo.SaveEstimate(ctx, resp); err != nil {
		return nil, fmt.Errorf("cache error: %w", err)
	}

	return resp, nil
}

func (s *pricingServiceImpl) GetConfig(ctx context.Context) (*domain.PricingConfig, error) {
	return s.pricingRepo.GetActiveConfig(ctx)
}
