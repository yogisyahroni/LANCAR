package service

import (
	"context"
	"fmt"
	"math"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/featureflags"
	"time"

	"github.com/google/uuid"
)

type pricingServiceImpl struct {
	pricingRepo domain.PricingRepository
	mapsRepo    domain.MapsRepository
	redisRepo   domain.RedisRepository
	flagReader  featureflags.FlagReader
	configRepo  domain.ConfigRepository
}

func NewPricingService(p domain.PricingRepository, m domain.MapsRepository, r domain.RedisRepository, f featureflags.FlagReader, cr domain.ConfigRepository) domain.PricingService {
	return &pricingServiceImpl{
		pricingRepo: p,
		mapsRepo:    m,
		redisRepo:   r,
		flagReader:  f,
		configRepo:  cr,
	}
}

func applyRoundingPolicy(amount int64, mode string, precision int64) int64 {
	if precision <= 1 || amount == 0 {
		return amount
	}
	switch mode {
	case "ceil":
		remainder := amount % precision
		if remainder > 0 {
			return amount + (precision - remainder)
		}
		return amount
	case "floor":
		return amount - (amount % precision)
	case "round":
		fallthrough
	default:
		remainder := amount % precision
		if remainder >= precision/2 {
			return amount + (precision - remainder)
		}
		return amount - remainder
	}
}

func (s *pricingServiceImpl) Estimate(ctx context.Context, req domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {
	if !validOrderCoordinate(req.PickupLat, req.PickupLng) || !validOrderCoordinate(req.DropoffLat, req.DropoffLng) {
		return nil, domain.ErrInvalidCoordinates
	}

	// 0.1 Check Coverage for Pickup and Dropoff
	pickupCovered, err := s.pricingRepo.CheckCoverage(ctx, req.PickupLat, req.PickupLng)
	if err != nil {
		return nil, fmt.Errorf("coverage check error: %w", err)
	}
	if !pickupCovered {
		return nil, domain.ErrLocationNotCovered
	}

	dropoffCovered, err := s.pricingRepo.CheckCoverage(ctx, req.DropoffLat, req.DropoffLng)
	if err != nil {
		return nil, fmt.Errorf("coverage check error: %w", err)
	}
	if !dropoffCovered {
		return nil, domain.ErrLocationNotCovered
	}

	// 1. Get traffic-aware distance and duration from the configured maps provider
	distKM, durMin, originAddr, destAddr, err := s.mapsRepo.GetDistanceMatrix(ctx, req.PickupLat, req.PickupLng, req.DropoffLat, req.DropoffLng, true)
	if err != nil {
		return nil, fmt.Errorf("maps error: %w", err)
	}

	// 2. Determine which model was requested
	var requestedModel string
	if len(req.Models) > 0 {
		requestedModel = req.Models[0]
	} else {
		requestedModel = "p2p" // Fallback to legacy default if none specified
	}

	// 3. Get Delivery Service Product
	serviceProduct, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, requestedModel)
	if err != nil {
		// Fallback to p2p lookup in legacy table if not found in delivery_service_products?
		// Better to just error out cleanly or support a hard fallback to p2p
		// For now, let's assume all valid codes are in the delivery_service_products table.
		return nil, &domain.ModelUnavailableError{
			Model:     requestedModel,
			MessageID: "MSG_MODEL_UNAVAILABLE",
			UserMsg:   fmt.Sprintf("Delivery model %s is currently unavailable", requestedModel),
		}
	}

	// 3.5 Check Flags
	if req.IsARCore {
		arcoreEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "arcore_scanning", false)
		if !arcoreEnabled {
			return nil, fmt.Errorf("Feature ARCore Scanning is disabled")
		}
	}
	if req.IsVolumetric {
		volumetricEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "volumetric_scanning", false)
		if !volumetricEnabled {
			return nil, fmt.Errorf("Feature Volumetric Scanning is disabled")
		}
	}

	// 4. Calculate Volumetric Weight
	volumetricDiv := s.configRepo.GetFloatConfig(ctx, "volumetric_div", 6000.0)
	volWeight := (req.Length * req.Width * req.Height) / volumetricDiv
	effectiveWeight := req.Weight
	if serviceProduct.UsesSizeTier {
		effectiveWeight = math.Max(req.Weight, volWeight)
	}

	if serviceProduct.MaxWeightKG != nil && effectiveWeight > *serviceProduct.MaxWeightKG {
		return nil, fmt.Errorf("weight exceeds maximum allowed for this service")
	}
	if serviceProduct.MaxDistanceKM != nil && distKM > *serviceProduct.MaxDistanceKM {
		return nil, fmt.Errorf("distance exceeds maximum allowed for this service")
	}

	// 5. Calculate Base Prices
	baseFare := int64(serviceProduct.BaseFareIDR)
	var distanceFare int64 = 0

	if distKM > serviceProduct.IncludedDistanceKM {
		chargeableDistance := distKM - serviceProduct.IncludedDistanceKM
		distanceFare = int64(chargeableDistance * float64(serviceProduct.PerKmIDR))
	}

	durationFare := int64(0) // Duration fare can be configured via system_configs if needed in the future

	subtotal := baseFare + distanceFare + durationFare

	// 5.1 Apply Weight Bracket Surcharge
	var weightSurcharge int64 = 0
	if serviceProduct.UsesSizeTier {
		tier1Surcharge := s.configRepo.GetFloatConfig(ctx, "weight_surcharge_tier1", 0.15)
		tier2Surcharge := s.configRepo.GetFloatConfig(ctx, "weight_surcharge_tier2", 0.30)

		tier1Weight := s.configRepo.GetFloatConfig(ctx, "weight_tier1_threshold_kg", 2.0)
		tier2Weight := s.configRepo.GetFloatConfig(ctx, "weight_tier2_threshold_kg", 5.0)

		if effectiveWeight > tier2Weight {
			weightSurcharge = int64(float64(subtotal) * tier2Surcharge)
		} else if effectiveWeight > tier1Weight {
			weightSurcharge = int64(float64(subtotal) * tier1Surcharge)
		}
	}
	subtotal += weightSurcharge

	// 6. Apply Dynamic Multiplier (Surge breakdown for audit PRC-003)
	surgeMultiplier, err := s.redisRepo.GetMultiplier(ctx, "default")
	if err != nil {
		return nil, fmt.Errorf("surge multiplier error: %w", err)
	}

	peakHourEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "dynamic_pricing_peak_hour", false)
	demandSupplyEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "dynamic_pricing_demand_supply", false)

	trafficMultiplier := 1.0
	weatherMultiplier := 1.0
	if peakHourEnabled {
		peakHourSurge := s.configRepo.GetFloatConfig(ctx, "surge_peak_hour_multiplier", 0.20)
		trafficMultiplier += peakHourSurge
	}
	if demandSupplyEnabled {
		demandSupplySurge := s.configRepo.GetFloatConfig(ctx, "surge_high_demand_multiplier", 0.15)
		weatherMultiplier += demandSupplySurge
	}
	totalMultiplier := surgeMultiplier * trafficMultiplier * weatherMultiplier

	dynamicPrice := int64(float64(subtotal) * (totalMultiplier - 1.0))
	priceAfterSurge := int64(float64(subtotal) * totalMultiplier)

	var insuranceFee int64 = 0
	insuranceEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "package_insurance", false)
	if insuranceEnabled {
		insuranceFee = int64(s.configRepo.GetIntConfig(ctx, "insurance_fee_idr", 5000))
		priceAfterSurge += insuranceFee
	}

	// 7. Apply Platform Fee (Biaya Layanan Operasional) with Min Threshold PRC-002
	fixedPlatformFee := serviceProduct.PlatformFeeIDR
	pctPlatformFee := int64(float64(priceAfterSurge) * serviceProduct.PlatformFeePct)
	platformFee := int64(fixedPlatformFee) + pctPlatformFee
	minPlatformFee := int64(s.configRepo.GetIntConfig(ctx, "min_platform_fee_idr", 1000))
	if platformFee < minPlatformFee {
		platformFee = minPlatformFee
	}

	// 7.1 Promo & Discount Accounting PRC-004
	var discountIDR int64 = 0
	var promoSubsidyIDR int64 = 0
	promoSponsor := "platform"
	if req.PromoCode != "" {
		maxSubsidy := int64(s.configRepo.GetIntConfig(ctx, "max_discount_subsidy_idr", 25000))
		// Apply configurable discount if promo code provided
		discountPct := s.configRepo.GetFloatConfig(ctx, "promo_discount_pct_"+req.PromoCode, 0.10)
		rawDiscount := int64(float64(priceAfterSurge) * discountPct)
		if rawDiscount > maxSubsidy {
			rawDiscount = maxSubsidy
		}
		discountIDR = rawDiscount
		promoSponsor = s.configRepo.GetStringConfig(ctx, "promo_sponsor_"+req.PromoCode, "platform")
		if promoSponsor == "platform" {
			promoSubsidyIDR = discountIDR
		}
	}

	totalBeforeRounding := priceAfterSurge + platformFee - discountIDR
	if totalBeforeRounding < 0 {
		totalBeforeRounding = 0
	}

	// 7.2 Dynamic Configurable Rounding Policy PRC-002
	roundingMode := s.configRepo.GetStringConfig(ctx, "pricing_rounding_mode", "round")
	roundingPrecision := int64(s.configRepo.GetIntConfig(ctx, "pricing_rounding_precision_idr", 100))
	totalPrice := applyRoundingPolicy(totalBeforeRounding, roundingMode, roundingPrecision)

	// 8. Create Response with Complete Snapshot PRC-001 to PRC-004
	resp := &domain.PricingEstimateResponse{
		EstimateID:             uuid.New().String(),
		PickupAddress:          originAddr,
		DropoffAddress:         destAddr,
		DistanceKM:             distKM,
		IncludedDistanceKM:     serviceProduct.IncludedDistanceKM,
		DistanceFeeIDR:         distanceFare,
		DurationMin:            durMin,
		BasePriceIDR:           baseFare,
		VolumetricWeightKG:     volWeight,
		VolumetricSurchargeIDR: weightSurcharge,
		DynamicPriceIDR:        dynamicPrice,
		SurgeFeeIDR:            dynamicPrice,
		SurgeMultiplier:        surgeMultiplier,
		WeatherMultiplier:      weatherMultiplier,
		TrafficMultiplier:      trafficMultiplier,
		InsuranceFeeIDR:        insuranceFee,
		DiscountIDR:            discountIDR,
		PromoSubsidyIDR:        promoSubsidyIDR,
		PromoCode:              req.PromoCode,
		PromoSponsor:           promoSponsor,
		PlatformFeeIDR:         platformFee,
		PlatformFeePct:         serviceProduct.PlatformFeePct,
		TotalPriceIDR:          totalPrice,
		ExpiresAt:              time.Now().Add(10 * time.Minute),
		PickupLat:              req.PickupLat,
		PickupLng:              req.PickupLng,
		DropoffLat:             req.DropoffLat,
		DropoffLng:             req.DropoffLng,
		Model:                  serviceProduct.Code,
		Length:                 req.Length,
		Width:                  req.Width,
		Height:                 req.Height,
		Weight:                 req.Weight,
	}

	// 9. Cache in Redis
	if err := s.redisRepo.SaveEstimate(ctx, resp); err != nil {
		return nil, fmt.Errorf("cache error: %w", err)
	}

	return resp, nil
}

func validOrderCoordinate(lat, lng float64) bool {
	return !math.IsNaN(lat) && !math.IsInf(lat, 0) &&
		!math.IsNaN(lng) && !math.IsInf(lng, 0) &&
		lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
		!(lat == 0 && lng == 0)
}

func (s *pricingServiceImpl) EstimatePrice(ctx context.Context, req *domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {
	return s.Estimate(ctx, *req)
}

func (s *pricingServiceImpl) GetConfig(ctx context.Context) (*domain.PricingConfig, error) {
	return s.pricingRepo.GetActiveConfig(ctx, "p2p")
}

func (s *pricingServiceImpl) UpdateConfig(ctx context.Context, config *domain.PricingConfig) error {
	return s.pricingRepo.UpdateConfig(ctx, config)
}

func (s *pricingServiceImpl) SimulatePrice(ctx context.Context, req *domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {
	return s.Estimate(ctx, *req)
}

func (s *pricingServiceImpl) CalculateMerchantFee(ctx context.Context, itemPrice int64) int64 {
	// e.g. "merchant_transaction_fee_pct" defaulting to 0.025 (2.5%)
	feePct := s.configRepo.GetFloatConfig(ctx, "merchant_transaction_fee_pct", 0.025)
	return int64(float64(itemPrice) * feePct)
}
