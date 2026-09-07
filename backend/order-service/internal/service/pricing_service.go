package service

import (
	"context"
	"fmt"
	"log"
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
	if req.PackageFacts.Quantity < 0 || req.PackageFacts.Prohibited {
		return nil, domain.ErrForbiddenItem
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

	// 6. Apply the versioned, scoped dynamic pricing policy. The zone is
	// resolved server-side from pickup coordinates; clients cannot select a
	// cheaper zone by changing a request field.
	market := normalizePricingMarket(req.Market)
	policy, decision, err := evaluateDynamicPricing(ctx, s.redisRepo, s.pricingRepo, s.configRepo, serviceProduct.Code, market, req.PickupLat, req.PickupLng)
	if err != nil {
		return nil, fmt.Errorf("dynamic pricing evaluation: %w", err)
	}
	totalMultiplier := decision.Multiplier
	trafficMultiplier := 1.0
	if decision.PeakApplied {
		trafficMultiplier = policy.PeakMultiplier
	}
	weatherMultiplier := 1.0

	dynamicPrice := dynamicPriceAdjustment(subtotal, totalMultiplier)
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

	pricingRuleVersion := policy.PolicyVersion
	courierPayoutPercent := serviceProduct.CourierPayoutPercent
	if courierPayoutPercent <= 0 {
		courierPayoutPercent = s.configRepo.GetFloatConfig(ctx, "courier_payout_percent", 80)
	}
	if courierPayoutPercent < 0 || courierPayoutPercent > 100 {
		return nil, fmt.Errorf("invalid courier payout policy percent %.3f", courierPayoutPercent)
	}
	transportGross := baseFare + distanceFare + weightSurcharge + dynamicPrice
	if transportGross < 0 {
		transportGross = 0
	}
	courierEarning := int64(math.Round(float64(transportGross) * courierPayoutPercent / 100))
	components := []domain.PricingComponent{
		pricingComponent("base_fare", domain.PricingComponentCustomerCharge, baseFare, true),
		pricingComponent("distance_fee", domain.PricingComponentCustomerCharge, distanceFare, true),
		pricingComponent("weight_surcharge", domain.PricingComponentCustomerCharge, weightSurcharge, true),
		pricingComponent("dynamic_adjustment", domain.PricingComponentCustomerAdjustment, dynamicPrice, true),
		pricingComponent("insurance_fee", domain.PricingComponentCustomerCharge, insuranceFee, true),
		pricingComponent("platform_fee", domain.PricingComponentCustomerCharge, platformFee, true),
		pricingComponent("promo_discount", domain.PricingComponentCustomerDiscount, discountIDR, true),
		pricingComponent("courier_earning", domain.PricingComponentCourierEarning, courierEarning, false),
	}
	roundingAdjustment := totalPrice - (totalBeforeRounding)
	if roundingAdjustment != 0 {
		components = append(components, pricingComponent("rounding_adjustment", domain.PricingComponentCustomerAdjustment, roundingAdjustment, true))
	}
	breakdown, err := buildPricingBreakdown(ctx, s.configRepo, serviceProduct.Code, market, pricingRuleVersion, components)
	if err != nil {
		return nil, fmt.Errorf("pricing reconciliation: %w", err)
	}
	breakdown.TriggerContext = decision.TriggerContext

	// 8. Create Response with Complete Snapshot PRC-001 to PRC-004
	quoteID := uuid.New().String()
	resp := &domain.PricingEstimateResponse{
		EstimateID:             quoteID, // legacy field retained as the quote ID
		QuoteID:                quoteID,
		InputFingerprint:       domain.QuoteInputFingerprint(req),
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
		SurgeMultiplier:        totalMultiplier,
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
		PackageFacts:           req.PackageFacts,
		ServiceCategory:        domain.CanonicalServiceCategoryForModel(serviceProduct.Code),
		Currency:               "IDR",
		ETASource:              "maps.traffic",
		PricingRuleVersion:     pricingRuleVersion,
		Market:                 breakdown.Market,
		PricingBreakdown:       breakdown,
		PriceComponents: map[string]int64{
			"base_fare_idr":        baseFare,
			"distance_fee_idr":     distanceFare,
			"weight_surcharge_idr": weightSurcharge,
			"dynamic_price_idr":    dynamicPrice,
			"insurance_fee_idr":    insuranceFee,
			"platform_fee_idr":     platformFee,
			"discount_idr":         discountIDR,
			"customer_total_idr":   totalPrice,
			"courier_earning_idr":  courierEarning,
			"merchant_payable_idr": breakdown.MerchantPayableIDR,
			"platform_amount_idr":  breakdown.PlatformAmountIDR,
			"total_price_idr":      totalPrice,
		},
	}
	resp.SnapshotHash = domain.QuoteSnapshotHash(*resp)
	log.Printf("[PricingQuote] quote_id=%s policy_version=%s service=%s market=%s trigger_context=%v", resp.QuoteID, pricingRuleVersion, serviceProduct.Code, market, decision.TriggerContext)

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
