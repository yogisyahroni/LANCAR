package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	if !merchant.IsOpen {
		return nil, domain.NewUserFacingError("merchant tutup")
	}
	if merchant.PausedUntil != nil && merchant.PausedUntil.After(time.Now()) {
		return nil, domain.NewUserFacingError("merchant sedang pause — coba lagi nanti")
	}
	if merchant.Lat == 0 && merchant.Lng == 0 {
		return nil, domain.NewUserFacingError("merchant belum melengkapi lokasi toko")
	}
	if req.IsScheduled {
		if err := validateScheduledAt(req.ScheduledAt, merchant.JamBuka, merchant.JamTutup, time.Now()); err != nil {
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
		if !item.IsAvailable {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak tersedia: %s", item.Name))
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
	platformPct := product.PlatformFeePct
	if platformPct <= 0 {
		platformPct = 10
	}
	platformFee := int64(math.Round(float64(subtotal) * platformPct / 100))
	if s.taxSvc == nil {
		return nil, fmt.Errorf("food tax service not wired")
	}
	taxSnapshot, err := s.taxSvc.CalculateOrderTax(ctx, subtotal+deliveryFee, platformFee, false)
	if err != nil {
		return nil, fmt.Errorf("calculate food tax: %w", err)
	}
	taxIDR := taxSnapshot.PPNIDR
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
	ruleVersion := "food-pricing-2026-09-01"
	if s.configRepo != nil {
		etaSpeed = s.configRepo.GetFloatConfig(ctx, "food_eta_speed_kmh", etaSpeed)
		ruleVersion = s.configRepo.GetStringConfig(ctx, "pricing_rule_version", ruleVersion)
	}
	if etaSpeed <= 0 {
		etaSpeed = 20
	}
	quote := &domain.FoodQuoteResponse{
		QuoteID: uuid.New().String(), InputFingerprint: foodQuoteInputFingerprint(req),
		MerchantID: req.MerchantID, Items: quoteItems, SubtotalIDR: subtotal,
		DeliveryFeeIDR: deliveryFee, PlatformFeeIDR: platformFee, TaxIDR: taxIDR, DiscountIDR: discount,
		TotalPriceIDR: total, DistanceKM: distanceKM,
		ETAMinutes: maxPrep + int(math.Ceil(distanceKM/etaSpeed*60)),
		ETASource:  "merchant_prep_plus_configured_route_speed", PricingRuleVersion: ruleVersion,
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}
	stored := &domain.PricingEstimateResponse{
		EstimateID: quote.QuoteID, QuoteID: quote.QuoteID, InputFingerprint: quote.InputFingerprint,
		ServiceCategory: "food", Currency: "IDR", TotalPriceIDR: total, ExpiresAt: quote.ExpiresAt,
		BasePriceIDR: subtotal, DistanceKM: distanceKM, DistanceFeeIDR: deliveryFee,
		PlatformFeeIDR: platformFee, PlatformFeePct: platformPct, TaxIDR: taxIDR, DiscountIDR: discount,
		ETASource: quote.ETASource, PricingRuleVersion: ruleVersion,
		FoodMerchantID: req.MerchantID, FoodItems: req.Items, FoodDropoffAddress: req.DropoffAddress,
		FoodDropoffCity: req.DropoffCity, FoodDropoffZipCode: req.DropoffZipCode,
		FoodVoucherCode: req.VoucherCode, FoodScheduledAt: req.ScheduledAt,
		PriceComponents: map[string]int64{
			"food_subtotal_idr": subtotal, "delivery_fee_idr": deliveryFee,
			"platform_fee_idr": platformFee, "tax_idr": taxIDR, "discount_idr": discount, "total_price_idr": total,
		},
	}
	stored.SnapshotHash = domain.QuoteSnapshotHash(*stored)
	if err := s.redisRepo.SaveEstimate(ctx, stored); err != nil {
		return nil, fmt.Errorf("save food quote: %w", err)
	}
	return quote, nil
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
