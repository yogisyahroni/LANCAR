package service

import (
	"context"
	"fmt"
	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/featureflags"
	"math"
	"time"

	"github.com/google/uuid"
)

type pricingServiceImpl struct {
	pricingRepo domain.PricingRepository
	mapsRepo    domain.MapsRepository
	redisRepo   domain.RedisRepository
	flagReader  featureflags.FlagReader
}

func NewPricingService(p domain.PricingRepository, m domain.MapsRepository, r domain.RedisRepository, f featureflags.FlagReader) domain.PricingService {
	return &pricingServiceImpl{
		pricingRepo: p,
		mapsRepo:    m,
		redisRepo:   r,
		flagReader:  f,
	}
}

func (s *pricingServiceImpl) Estimate(ctx context.Context, req domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {
	// 0. Check Feature Flags for Model Availability
	if len(req.Models) == 0 {
		return nil, domain.ErrModelUnavailable
	}

	flags, err := s.flagReader.GetFlags(ctx, req.Models)
	if err != nil {
		return nil, fmt.Errorf("flag error: %w", err)
	}

	// 1. Get Distance and Duration from Google Maps
	distKM, durMin, originAddr, destAddr, err := s.mapsRepo.GetDistanceMatrix(ctx, req.PickupLat, req.PickupLng, req.DropoffLat, req.DropoffLng)
	if err != nil {
		return nil, fmt.Errorf("maps error: %w", err)
	}

	// 2. Select Best Available Model (Business Logic)
	// Priority order based on user input, but verified against flags and distance constraints
	var selectedModel string
	for _, m := range req.Models {
		flag, ok := flags[m]
		if !ok || flag == nil || !flag.IsEnabled {
			continue
		}

		// Check distance constraints if defined in config
		if maxDist, ok := flag.Config["max_distance_km"].(float64); ok && maxDist > 0 {
			if distKM > maxDist {
				continue
			}
		}

		selectedModel = m
		break
	}

	if selectedModel == "" {
		return nil, domain.ErrModelUnavailable
	}

	// 3. Get Pricing Configuration
	config, err := s.pricingRepo.GetActiveConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("config error: %w", err)
	}

	// 4. Calculate Volumetric Weight
	volWeight := (req.Length * req.Width * req.Height) / config.VolumetricDiv
	effectiveWeight := math.Max(req.Weight, volWeight)

	// 5. Calculate Base Prices
	baseFare := config.BaseFare
	distanceFare := int64(distKM * float64(config.PerKMFare))
	weightFare := int64(effectiveWeight * float64(config.PerKGFare))

	subtotal := baseFare + distanceFare + weightFare
	if subtotal < config.MinFare {
		subtotal = config.MinFare
	}

	// 6. Apply Dynamic Multiplier (Surge)
	multiplier, err := s.redisRepo.GetMultiplier(ctx)
	if err != nil {
		multiplier = 1.0 // Fallback
	}

	dynamicPrice := int64(float64(subtotal) * (multiplier - 1.0))
	totalPrice := int64(float64(subtotal) * multiplier)

	// 7. Create Response
	resp := &domain.PricingEstimateResponse{
		EstimateID:             uuid.New().String(),
		PickupAddress:          originAddr,
		DropoffAddress:         destAddr,
		DistanceKM:             distKM,
		DurationMin:            durMin,
		BasePriceIDR:           subtotal,
		VolumetricSurchargeIDR: weightFare,
		DynamicPriceIDR:        dynamicPrice,
		TotalPriceIDR:          totalPrice,
		ExpiresAt:              time.Now().Add(10 * time.Minute),
		PickupLat:              req.PickupLat,
		PickupLng:              req.PickupLng,
		DropoffLat:             req.DropoffLat,
		DropoffLng:             req.DropoffLng,
		Model:                  selectedModel,
	}

	// 8. Cache in Redis
	if err := s.redisRepo.SaveEstimate(ctx, resp); err != nil {
		return nil, fmt.Errorf("cache error: %w", err)
	}

	return resp, nil
}

func (s *pricingServiceImpl) GetConfig(ctx context.Context) (*domain.PricingConfig, error) {
	return s.pricingRepo.GetActiveConfig(ctx)
}
