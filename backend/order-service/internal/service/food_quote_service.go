package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

// foodQuoteInputFingerprint covers every value that can change the Food
// price. Notes/receiver fields are intentionally excluded because they do not
// affect pricing; destination, cart, voucher and schedule are included.
func foodQuoteInputFingerprint(req domain.CreateFoodOrderRequest) string {
	req.QuoteID = ""
	req.QuoteInputFingerprint = ""
	req.ReceiverName = ""
	req.ReceiverPhone = ""
	req.OrderNotes = ""
	req.Contactless = false
	payload, _ := json.Marshal(req)
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func (s *orderServiceImpl) QuoteFood(ctx context.Context, userID string, req domain.CreateFoodOrderRequest) (*domain.FoodQuoteResponse, error) {
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "IDR"
	}
	currency, currencyMinorUnit, err := domain.NormalizeCurrency(currency)
	if err != nil {
		return nil, domain.NewUserFacingError(fmt.Sprintf("mata uang pesanan tidak didukung: %v", err))
	}
	if req.CurrencyMinorUnit != 0 && req.CurrencyMinorUnit != currencyMinorUnit {
		return nil, domain.NewUserFacingError(fmt.Sprintf("minor unit mata uang %s tidak sesuai", currency))
	}
	if currency != "IDR" {
		return nil, domain.NewUserFacingError(fmt.Sprintf("pricing makanan untuk %s belum tersedia karena konfigurasi harga multi-mata-uang belum aktif", currency))
	}
	if s.foodRepo == nil || s.redisRepo == nil {
		return nil, fmt.Errorf("food quote dependencies not wired")
	}
	if err := validateFoodDestination(req); err != nil {
		return nil, domain.NewUserFacingError(err.Error())
	}
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, req.MerchantID)
	if err != nil {
		return nil, err
	}
	if merchant.VerificationStatus != "approved" {
		return nil, domain.NewUserFacingError("merchant belum terverifikasi")
	}
	if merchant.EnforcementActive {
		return nil, domain.NewUserFacingError("merchant sedang dalam peninjauan kebijakan — coba lagi nanti")
	}
	if err := validateFoodMerchantOperatingState(merchant); err != nil {
		return nil, err
	}
	if foodLastOrderClosed(merchant, time.Now()) {
		return nil, domain.NewUserFacingError("batas waktu pemesanan merchant sudah lewat — pilih waktu atau merchant lain")
	}
	if merchant.PausedUntil != nil && merchant.PausedUntil.After(time.Now()) {
		return nil, domain.NewUserFacingError("merchant sedang pause — coba lagi nanti")
	}
	if merchant.Lat == 0 && merchant.Lng == 0 {
		return nil, domain.NewUserFacingError("merchant belum melengkapi lokasi toko")
	}
	if req.IsScheduled {
		if err := validateScheduledAtForMerchant(req.ScheduledAt, merchant.JamBuka, merchant.JamTutup, merchant.OperatingTimezone, time.Now()); err != nil {
			return nil, domain.NewUserFacingError(err.Error())
		}
	}

	menuIDs := make([]string, 0, len(req.Items))
	for _, item := range req.Items {
		if item.Quantity < 1 || item.Quantity > 99 {
			return nil, domain.NewUserFacingError("jumlah menu harus antara 1 dan 99")
		}
		menuIDs = append(menuIDs, item.MenuID)
	}
	menuItems, err := s.foodRepo.GetFoodMenuItems(ctx, menuIDs)
	if err != nil {
		return nil, err
	}
	menuByID := make(map[string]domain.FoodMenuItemInfo, len(menuItems))
	for _, item := range menuItems {
		menuByID[item.ID] = item
	}
	variantMap, err := s.foodRepo.GetMenuItemVariants(ctx, menuIDs)
	if err != nil {
		return nil, fmt.Errorf("get menu variants: %w", err)
	}

	quoteItems := make([]domain.FoodQuoteItem, 0, len(req.Items))
	var subtotal int64
	maxPrep := 0
	for _, requested := range req.Items {
		item, ok := menuByID[requested.MenuID]
		if !ok {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak ditemukan: %s", requested.MenuID))
		}
		if item.MerchantID != req.MerchantID {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item bukan milik merchant ini: %s", requested.MenuID))
		}
		if !item.IsAvailable || (item.Status != "" && item.Status != "active" && item.Status != "scheduled") {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak tersedia: %s", item.Name))
		}
		if item.ScheduleAvailable != nil && !*item.ScheduleAvailable {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item di luar jadwal: %s", item.Name))
		}
		if item.EnforcementActive {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item sedang ditangguhkan untuk peninjauan: %s", item.Name))
		}
		if err := validateFoodInventory(item, requested.Quantity, time.Now()); err != nil {
			return nil, domain.NewUserFacingError(err.Error())
		}
		variants := variantMap[requested.MenuID]
		selectedByVariant := make(map[string][]string)
		optionByID := make(map[string]domain.MenuItemVariantOption)
		for _, variant := range variants {
			for _, option := range variant.Options {
				optionByID[option.ID] = option
			}
		}
		var delta int64
		selected := make([]domain.FoodOrderItemVariant, 0, len(requested.Variants))
		for _, choice := range requested.Variants {
			var found *domain.MenuItemVariant
			for i := range variants {
				if variants[i].ID == choice.VariantID {
					found = &variants[i]
					break
				}
			}
			option, optionOK := optionByID[choice.OptionID]
			if found == nil || !optionOK || option.VariantID != choice.VariantID {
				return nil, domain.NewUserFacingError(fmt.Sprintf("pilihan varian tidak valid untuk %s", item.Name))
			}
			selectedByVariant[choice.VariantID] = append(selectedByVariant[choice.VariantID], choice.OptionID)
			delta += option.PriceDelta
			selected = append(selected, domain.FoodOrderItemVariant{
				VariantID: found.ID, OptionID: option.ID, VariantName: found.Nama,
				OptionName: option.Nama, PriceDelta: option.PriceDelta,
			})
		}
		for _, variant := range variants {
			count := len(selectedByVariant[variant.ID])
			if variant.IsRequired && count == 0 {
				return nil, domain.NewUserFacingError(fmt.Sprintf("pilih %s dulu untuk %s", variant.Nama, item.Name))
			}
			if count > variant.MaxSelect || (count > 0 && count < variant.MinSelect) {
				return nil, domain.NewUserFacingError(fmt.Sprintf("jumlah pilihan %s tidak valid untuk %s", variant.Nama, item.Name))
			}
		}
		unitPrice := item.Price + delta
		lineTotal := unitPrice * int64(requested.Quantity)
		subtotal += lineTotal
		maxPrep = max(maxPrep, item.PrepTimeMinutes)
		quoteItems = append(quoteItems, domain.FoodQuoteItem{
			MenuItemID: item.ID, ItemName: item.Name, UnitPrice: unitPrice,
			Quantity: requested.Quantity, Subtotal: lineTotal, Variants: selected,
		})
	}
	if merchant.MinOrderIDR > 0 && subtotal < merchant.MinOrderIDR {
		return nil, domain.NewUserFacingError(fmt.Sprintf("minimum order di toko ini Rp %d", merchant.MinOrderIDR))
	}

	distanceKM := haversineKM(merchant.Lat, merchant.Lng, req.DropoffLat, req.DropoffLng)
	if err := validateFoodDeliveryDistance(distanceKM); err != nil {
		return nil, domain.NewUserFacingError(err.Error())
	}
	product, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, "food_delivery")
	if err != nil || product == nil {
		return nil, fmt.Errorf("service product food_delivery tidak ditemukan: %w", err)
	}
	deliveryFee := product.BaseFareIDR
	if distanceKM > product.IncludedDistanceKM {
		deliveryFee += int64(math.Ceil(distanceKM-product.IncludedDistanceKM)) * product.PerKmIDR
	}
	market := normalizePricingMarket(req.Market)
	policy, decision, err := evaluateDynamicPricing(ctx, s.redisRepo, s.pricingRepo, s.configRepo, product.Code, market, merchant.Lat, merchant.Lng)
	if err != nil {
		return nil, fmt.Errorf("food dynamic pricing evaluation: %w", err)
	}
	quoteExpiresAt := time.Now().Add(10 * time.Minute)
	var experiment *pricingExperimentConfig
	var experimentAssignment pricingExperimentAssignment
	experiment, err = loadFoodPricingExperiment(ctx, s.configRepo, market, time.Now())
	if err != nil {
		return nil, fmt.Errorf("food pricing experiment evaluation: %w", err)
	}
	if experiment != nil {
		experimentAssignment = assignPricingExperiment(*experiment, "customer", userID, quoteExpiresAt)
		decision = applyPricingExperiment(experiment, experimentAssignment, decision)
	}
	baseDeliveryFee := deliveryFee
	dynamicAdjustment, err := dynamicPriceAdjustment(baseDeliveryFee, decision.Multiplier)
	if err != nil {
		return nil, err
	}
	grossDeliveryFee := baseDeliveryFee + dynamicAdjustment
	deliveryFee = grossDeliveryFee
	membershipSubsidy := int64(0)
	membershipID := ""
	if s.membershipRepo != nil {
		entitlement, plan, benefitErr := s.membershipRepo.GetActiveFoodMembership(ctx, userID)
		if benefitErr != nil {
			return nil, fmt.Errorf("get food membership entitlement: %w", benefitErr)
		}
		membership := domain.CalculateFoodMembershipBenefit(entitlement, plan, subtotal, deliveryFee, req.DeliveryMethod)
		membershipSubsidy = membership.SubsidyIDR
		membershipID = membership.EntitlementID
		deliveryFee -= membershipSubsidy
	}
	platformPct := product.PlatformFeePct
	if platformPct <= 0 {
		platformPct = 10
	}
	platformFeeMoney, err := domain.LegacyIDR(subtotal).MultiplyPercent(platformPct)
	if err != nil {
		return nil, fmt.Errorf("calculate food platform fee: %w", err)
	}
	platformFee := platformFeeMoney.AmountMinor
	if s.taxSvc == nil {
		return nil, fmt.Errorf("food tax service not wired")
	}
	taxSnapshot, err := s.taxSvc.CalculateOrderTax(ctx, subtotal+deliveryFee, platformFee, false)
	if err != nil {
		return nil, fmt.Errorf("calculate food tax: %w", err)
	}
	taxIDR := taxSnapshot.PPNMinor
	if taxIDR == 0 && taxSnapshot.Currency == "IDR" {
		taxIDR = taxSnapshot.PPNIDR
	}
	total := subtotal + deliveryFee + platformFee + taxIDR
	discount := int64(0)
	if strings.TrimSpace(req.VoucherCode) != "" {
		if s.voucherSvc == nil {
			return nil, domain.NewUserFacingError("voucher belum dapat divalidasi")
		}
		validation, validateErr := s.voucherSvc.Validate(ctx, req.VoucherCode, userID, subtotal+deliveryFee, "p2p")
		if validateErr != nil {
			return nil, fmt.Errorf("voucher: %w", validateErr)
		}
		if !validation.Valid {
			return nil, domain.NewUserFacingError(fmt.Sprintf("voucher tidak valid: %s", validation.Error))
		}
		discount = min(validation.DiscountIDR, total)
		total -= discount
	}

	etaSpeed := 20.0
	if s.configRepo != nil {
		etaSpeed = s.configRepo.GetFloatConfig(ctx, "food_eta_speed_kmh", etaSpeed)
	}
	if etaSpeed <= 0 {
		etaSpeed = 20
	}
	pricingRuleVersion := policy.PolicyVersion
	if experiment != nil {
		pricingRuleVersion = experimentAssignment.PricingRuleVersion
	}
	merchantCommissionPercent := product.PlatformCommissionPercent
	if merchantCommissionPercent <= 0 {
		merchantCommissionPercent = s.configRepo.GetFloatConfig(ctx, "merchant_commission_percent", 2.5)
	}
	if merchantCommissionPercent < 0 || merchantCommissionPercent > 100 {
		return nil, fmt.Errorf("invalid merchant commission policy percent %.3f", merchantCommissionPercent)
	}
	merchantCommissionMoney, err := domain.LegacyIDR(subtotal).MultiplyPercent(merchantCommissionPercent)
	if err != nil {
		return nil, fmt.Errorf("calculate merchant commission: %w", err)
	}
	merchantCommission := merchantCommissionMoney.AmountMinor
	courierPayoutPercent := product.CourierPayoutPercent
	if courierPayoutPercent <= 0 {
		courierPayoutPercent = s.configRepo.GetFloatConfig(ctx, "courier_payout_percent", 80)
	}
	if courierPayoutPercent < 0 || courierPayoutPercent > 100 {
		return nil, fmt.Errorf("invalid courier payout policy percent %.3f", courierPayoutPercent)
	}
	courierEarningMoney, err := domain.LegacyIDR(grossDeliveryFee).MultiplyPercent(courierPayoutPercent)
	if err != nil {
		return nil, fmt.Errorf("calculate food courier earning: %w", err)
	}
	courierEarning := courierEarningMoney.AmountMinor
	components := []domain.PricingComponent{
		pricingComponent("item_subtotal", domain.PricingComponentCustomerCharge, subtotal, true),
		pricingComponent("delivery_fee", domain.PricingComponentCustomerCharge, baseDeliveryFee, true),
		pricingComponent("dynamic_adjustment", domain.PricingComponentCustomerAdjustment, dynamicAdjustment, true),
		pricingComponent("platform_fee", domain.PricingComponentCustomerCharge, platformFee, true),
		pricingComponent("tax", domain.PricingComponentCustomerCharge, taxIDR, true),
		pricingComponent("membership_subsidy", domain.PricingComponentCustomerDiscount, membershipSubsidy, true),
		pricingComponent("promo_discount", domain.PricingComponentCustomerDiscount, discount, true),
		pricingComponent("merchant_gross", domain.PricingComponentMerchantGross, subtotal, false),
		pricingComponent("merchant_commission", domain.PricingComponentMerchantCommission, merchantCommission, false),
		pricingComponent("courier_earning", domain.PricingComponentCourierEarning, courierEarning, false),
	}
	breakdown, err := buildPricingBreakdown(ctx, s.configRepo, product.Code, market, pricingRuleVersion, components)
	if err != nil {
		return nil, fmt.Errorf("food pricing reconciliation: %w", err)
	}
	breakdown.TriggerContext = decision.TriggerContext
	prepMinutes := maxPrep
	if merchant.BusyUntil != nil && merchant.BusyUntil.After(time.Now()) {
		prepMinutes += merchant.BusyExtraPrepMinutes
	}
	// Live traffic and courier supply are not known at quote time. Keep those
	// signals explicit instead of presenting configured route speed as traffic.
	pickupTravelMinutes := int(math.Ceil(distanceKM / etaSpeed * 60))
	quote := &domain.FoodQuoteResponse{
		QuoteID: uuid.New().String(), InputFingerprint: foodQuoteInputFingerprint(req),
		MerchantID: req.MerchantID, Currency: currency, CurrencyMinorUnit: currencyMinorUnit, Items: quoteItems, SubtotalIDR: subtotal,
		DeliveryFeeIDR: deliveryFee, PlatformFeeIDR: platformFee, TaxIDR: taxIDR, DiscountIDR: discount, MembershipSubsidyIDR: membershipSubsidy,
		TotalPriceIDR: total, DistanceKM: distanceKM,
		ETAMinutes: prepMinutes + pickupTravelMinutes,
		ETASource:  "merchant_prep_plus_configured_route_speed", PricingRuleVersion: pricingRuleVersion, Market: market,
		SurgeMultiplier:  decision.Multiplier,
		PricingBreakdown: breakdown,
		PrepMinutes:      prepMinutes, PickupTravelMinutes: pickupTravelMinutes,
		// Traffic, batching, and live courier supply are not available from a
		// provider-backed signal in this quote path. Keep them unknown instead
		// of converting configured route speed into fake traffic/supply data.
		TrafficMinutes:  nil,
		BatchingMinutes: nil,
		SupplyStatus:    "unknown",
		Confidence:      "medium",
		ExpiresAt:       quoteExpiresAt,
	}
	if experiment != nil {
		quote.ExperimentID = experimentAssignment.ExperimentID
		quote.ExperimentVariant = experimentAssignment.Variant
		quote.ExperimentAssignmentKey = experimentAssignment.AssignmentKey
		quote.ExperimentPricingRuleVersion = experimentAssignment.PricingRuleVersion
		quote.ExperimentQuoteWindowExpiresAt = &quoteExpiresAt
	}
	stored := &domain.PricingEstimateResponse{
		EstimateID: quote.QuoteID, QuoteID: quote.QuoteID, InputFingerprint: quote.InputFingerprint,
		ServiceCategory: "food", Currency: currency, CurrencyMinorUnit: currencyMinorUnit, TotalPriceIDR: total, TotalPriceMinor: total, ExpiresAt: quote.ExpiresAt,
		Market:     market,
		ETAMinutes: quote.ETAMinutes, PrepMinutes: quote.PrepMinutes,
		PickupTravelMinutes: quote.PickupTravelMinutes, TrafficMinutes: quote.TrafficMinutes,
		BatchingMinutes: quote.BatchingMinutes, SupplyStatus: quote.SupplyStatus,
		Confidence:   quote.Confidence,
		BasePriceIDR: subtotal, DistanceKM: distanceKM, DistanceFeeIDR: deliveryFee,
		DynamicPriceIDR: dynamicAdjustment, SurgeFeeIDR: dynamicAdjustment, SurgeMultiplier: decision.Multiplier,
		PlatformFeeIDR: platformFee, PlatformFeePct: platformPct, TaxIDR: taxIDR, DiscountIDR: discount,
		ETASource: quote.ETASource, PricingRuleVersion: pricingRuleVersion,
		PricingBreakdown: breakdown,
		ExperimentID:     quote.ExperimentID, ExperimentVariant: quote.ExperimentVariant,
		ExperimentAssignmentKey:        quote.ExperimentAssignmentKey,
		ExperimentPricingRuleVersion:   quote.ExperimentPricingRuleVersion,
		ExperimentQuoteWindowExpiresAt: quote.ExperimentQuoteWindowExpiresAt,
		FoodMerchantID:                 req.MerchantID, FoodItems: req.Items, FoodDropoffAddress: req.DropoffAddress,
		FoodDropoffCity: req.DropoffCity, FoodDropoffZipCode: req.DropoffZipCode,
		FoodVoucherCode: req.VoucherCode, FoodScheduledAt: req.ScheduledAt,
		FoodMembershipID: membershipID,
		PriceComponents: map[string]int64{
			"food_subtotal_idr": subtotal, "delivery_fee_idr": deliveryFee, "dynamic_price_idr": dynamicAdjustment, "membership_subsidy_idr": membershipSubsidy,
			"platform_fee_idr": platformFee, "tax_idr": taxIDR, "discount_idr": discount,
			"merchant_commission_idr": merchantCommission, "courier_earning_idr": courierEarning,
			"customer_total_idr": total, "merchant_payable_idr": breakdown.MerchantPayableIDR,
			"platform_amount_idr": breakdown.PlatformAmountIDR, "total_price_idr": total,
		},
	}
	stored.ApplyMoneyContract()
	stored.SnapshotHash = domain.QuoteSnapshotHash(*stored)
	quote.SnapshotHash = domain.FoodQuoteSnapshotHash(*quote)
	log.Printf("[FoodPricingQuote] quote_id=%s policy_version=%s service=%s market=%s trigger_context=%v", quote.QuoteID, pricingRuleVersion, product.Code, market, decision.TriggerContext)
	if err := s.redisRepo.SaveEstimate(ctx, stored); err != nil {
		return nil, fmt.Errorf("save food quote: %w", err)
	}
	return quote, nil
}

func foodLastOrderClosed(merchant *domain.FoodMerchantInfo, now time.Time) bool {
	if merchant == nil || merchant.LastOrderMinutesBeforeClose <= 0 || merchant.JamTutup == nil {
		return false
	}
	closeAt, err := time.Parse("15:04", *merchant.JamTutup)
	if err != nil {
		return false
	}
	now = now.In(foodMerchantTimezone(merchant.OperatingTimezone))
	currentMinutes := now.Hour()*60 + now.Minute()
	closeMinutes := closeAt.Hour()*60 + closeAt.Minute()
	remaining := closeMinutes - currentMinutes
	if remaining < 0 {
		remaining += 24 * 60
	}
	return remaining <= merchant.LastOrderMinutesBeforeClose
}

func validateFoodMerchantOperatingState(merchant *domain.FoodMerchantInfo) error {
	if merchant == nil {
		return domain.NewUserFacingError("merchant tidak ditemukan")
	}
	switch merchant.OperatingState {
	case "", "open":
		if !merchant.IsOpen {
			return domain.NewUserFacingError("merchant tutup")
		}
	case "busy":
		// Busy remains orderable; the stored extra prep is added to ETA below.
	case "paused":
		return domain.NewUserFacingError("merchant sedang pause — coba lagi nanti")
	case "temp_closed":
		return domain.NewUserFacingError("merchant sedang ditutup sementara — coba lagi nanti")
	case "holiday":
		return domain.NewUserFacingError("merchant sedang libur — coba lagi nanti")
	case "closed":
		return domain.NewUserFacingError("merchant tutup")
	default:
		return domain.NewUserFacingError("status operasional merchant tidak tersedia")
	}
	return nil
}

func validateFoodInventory(item domain.FoodMenuItemInfo, quantity int, now time.Time) error {
	if item.StockQuantity != nil && *item.StockQuantity < quantity {
		return fmt.Errorf("stok %s tidak mencukupi", item.Name)
	}
	salesCount := item.DailySalesCount
	if item.SalesResetAt != nil && !item.SalesResetAt.After(now) {
		salesCount = 0
	}
	if item.DailySalesLimit != nil && salesCount+quantity > *item.DailySalesLimit {
		return fmt.Errorf("batas penjualan harian %s sudah tercapai", item.Name)
	}
	return nil
}

func (s *orderServiceImpl) requireFoodQuote(ctx context.Context, req domain.CreateFoodOrderRequest) (*domain.PricingEstimateResponse, error) {
	quoteID := strings.TrimSpace(req.QuoteID)
	if quoteID == "" {
		return nil, &domain.RequoteRequiredError{Reason: "food quote wajib dibuat sebelum order"}
	}
	quote, err := s.redisRepo.GetEstimate(ctx, quoteID)
	if err != nil || quote == nil || quote.ServiceCategory != "food" {
		return nil, &domain.RequoteRequiredError{QuoteID: quoteID, Reason: "food quote tidak ditemukan atau sudah kedaluwarsa"}
	}
	if !quote.ExpiresAt.After(time.Now()) {
		return nil, &domain.RequoteRequiredError{QuoteID: quoteID, Reason: "food quote sudah kedaluwarsa"}
	}
	if req.QuoteInputFingerprint == "" || req.QuoteInputFingerprint != foodQuoteInputFingerprint(req) || req.QuoteInputFingerprint != quote.InputFingerprint {
		return nil, &domain.RequoteRequiredError{QuoteID: quoteID, Reason: "alamat, keranjang, voucher, atau jadwal berubah sejak quote dibuat"}
	}
	return quote, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
