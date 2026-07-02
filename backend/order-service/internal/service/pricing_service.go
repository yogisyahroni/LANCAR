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

func (s *pricingServiceImpl) Estimate(ctx context.Context, req domain.PricingEstimateRequest) (*domain.PricingEstimateResponse, error) {


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
		distanceFare = int64(chargeableDistance * serviceProduct.PerKmIDR)
	}

	durationFare := int64(0) // Duration fare can be configured via system_configs if needed in the future

	subtotal := baseFare + distanceFare + durationFare

	// 5.1 Apply Weight Bracket Surcharge
	var weightSurcharge int64 = 0
	if serviceProduct.UsesSizeTier {
		tier1Surcharge := s.configRepo.GetFloatConfig(ctx, "weight_surcharge_tier1", 0.15)
		tier2Surcharge := s.configRepo.GetFloatConfig(ctx, "weight_surcharge_tier2", 0.30)
		
		if effectiveWeight > 5 {
			weightSurcharge = int64(float64(subtotal) * tier2Surcharge)
		} else if effectiveWeight > 2 {
			weightSurcharge = int64(float64(subtotal) * tier1Surcharge)
		}
	}
	subtotal += weightSurcharge

	// 6. Apply Dynamic Multiplier (Surge)
	multiplier, err := s.redisRepo.GetMultiplier(ctx, "default")
	if err != nil {
		return nil, fmt.Errorf("surge multiplier error: %w", err)
	}

	peakHourEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "dynamic_pricing_peak_hour", false)
	demandSupplyEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "dynamic_pricing_demand_supply", false)

	if peakHourEnabled {
		multiplier += 0.20 // Add 20% surge
	}
	if demandSupplyEnabled {
		multiplier += 0.10 // Add 10% surge
	}

	dynamicPrice := int64(float64(subtotal) * (multiplier - 1.0))
	priceAfterSurge := int64(float64(subtotal) * multiplier)
	
	insuranceEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "package_insurance", false)
	if insuranceEnabled {
		// Biaya asuransi dapat dikonfigurasi via delivery_config dengan key "insurance_fee_idr".
		// Default: 5000 IDR. Admin dapat mengubah via config tanpa deploy ulang.
		insuranceFee := s.configRepo.GetIntConfig(ctx, "insurance_fee_idr", 5000)
		priceAfterSurge += int64(insuranceFee)
	}

	// 7. Apply Platform Fee (Biaya Layanan Operasional)
	//
	// Hybrid Platform Fee (Angka Flat + Persentase)
	// Untuk menutupi fixed cost (Infra/OTP) dan variable cost (Payment Gateway %).
	//
	// Fee dikonfigurasi via Delivery Service:
	// - "platform_fee_idr" (Default Rp 1.500)
	// - "platform_fee_pct" (Default 0.015 atau 1.5%)
	//
	// Diterapkan SETELAH surge multiplier.
	// Tidak ditampilkan sebagai line-item terpisah ke customer —
	// sudah tercakup dalam TotalPriceIDR sebagai bagian dari harga layanan.
	fixedPlatformFee := serviceProduct.PlatformFeeIDR
	pctPlatformFeeRate := serviceProduct.PlatformFeePct
	
	// Percentage portion based on the priceAfterSurge
	variablePlatformFee := float64(priceAfterSurge) * pctPlatformFeeRate
	
	platformFee := int64(fixedPlatformFee + variablePlatformFee)
	totalPrice := priceAfterSurge + platformFee

	// 8. Create Response
	resp := &domain.PricingEstimateResponse{
		EstimateID:             uuid.New().String(),
		PickupAddress:          originAddr,
		DropoffAddress:         destAddr,
		DistanceKM:             distKM,
		DurationMin:            durMin,
		BasePriceIDR:           subtotal,
		VolumetricSurchargeIDR: weightSurcharge,
		DynamicPriceIDR:        dynamicPrice,
		PlatformFeeIDR:         platformFee,
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
