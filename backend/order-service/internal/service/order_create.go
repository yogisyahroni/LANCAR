package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

// Auto-generated split of orderServiceImpl methods (god-file refactor).
func (s *orderServiceImpl) CreateOrder(ctx context.Context, userID string, req domain.CreateOrderRequest) (*domain.Order, error) {
	// ─────────────────────────────────────────────────────────────────────────
	// PATH A: 3PL Aggregator Order (LogisticsProvider != "")
	// Bypass Redis estimate — data comes directly from CreateOrderRequest.
	// ─────────────────────────────────────────────────────────────────────────
	// SECURITY FIX (2026): Prevent Price Manipulation via IDOR/Mass Assignment.
	// Clients calling this public endpoint cannot create 3PL orders directly.
	// 3PL orders MUST go through CreateInternalAggregatorOrder (e.g. from Payment Link flow)
	// where pricing is validated against the provider.
	if req.LogisticsProvider != "" {
		return nil, errors.New("logistics_provider is not allowed for on-demand orders. use payment link for 3PL.")
	}

	// TC-LOG-005: cegah order dengan kategori barang terlarang (gas, chemical,
	// weapon, flammable, explosive). Validasi case-insensitive.
	if err := validateItemCategory(req.Category, req.ItemDescription); err != nil {
		return nil, err
	}

	// ─────────────────────────────────────────────────────────────────────────
	// PATH B: On-Demand Order (original flow)
	// ─────────────────────────────────────────────────────────────────────────

	// 1. Get cached estimate from Redis
	estimate, err := s.redisRepo.GetEstimate(ctx, req.EstimateID)
	if err != nil {
		return nil, domain.ErrInvalidEstimate
	}
	if estimate.ExpiresAt.IsZero() || !estimate.ExpiresAt.After(time.Now()) {
		return nil, &domain.RequoteRequiredError{
			Reason:  "quote sudah kedaluwarsa",
			QuoteID: estimate.QuoteIDOrEstimateID(),
		}
	}
	if estimate.QuoteID != "" && estimate.QuoteID != req.EstimateID {
		return nil, &domain.RequoteRequiredError{
			Reason:  "quote_id tidak cocok dengan quote yang dipilih",
			QuoteID: estimate.QuoteID,
		}
	}
	if req.QuoteInputFingerprint != "" && req.QuoteInputFingerprint != estimate.InputFingerprint {
		return nil, &domain.RequoteRequiredError{
			Reason:       "input pricing berubah sejak quote dibuat",
			QuoteID:      estimate.QuoteIDOrEstimateID(),
			CurrentTotal: estimate.TotalPriceIDR,
		}
	}
	if req.QuoteSnapshotHash != "" && req.QuoteSnapshotHash != estimate.SnapshotHash {
		return nil, &domain.RequoteRequiredError{
			Reason:       "snapshot harga tidak lagi cocok",
			QuoteID:      estimate.QuoteIDOrEstimateID(),
			CurrentTotal: estimate.TotalPriceIDR,
		}
	}

	if req.IsScheduled {
		scheduledEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "scheduled_delivery", false)
		if !scheduledEnabled {
			return nil, fmt.Errorf("Feature Scheduled Delivery is disabled")
		}
	}

	// 2. Double check Feature Flag for the selected model
	flag, err := s.flagReader.GetFlag(ctx, estimate.Model)
	if err != nil || flag == nil || !flag.IsEnabled {
		// Analytics: model_unavailable_shown
		_ = s.eventBus.Publish(ctx, "analytics.events", map[string]interface{}{
			"event":          "model_unavailable_shown",
			"user_id":        userID,
			"model":          estimate.Model,
			"route_distance": estimate.DistanceKM,
			"timestamp":      time.Now().Unix(),
		})

		return nil, &domain.ModelUnavailableError{
			Model:     estimate.Model,
			MessageID: "MODEL_UNAVAILABLE",
			UserMsg:   "The selected delivery model is no longer available",
		}
	}

	// 3. Generate Order Number (TMBS + 6 Alphanumeric)
	orderNum := fmt.Sprintf("TMBS%s", strings.ToUpper(uuid.New().String()[:6]))
	handoverToken := uuid.New().String()

	// 4. Generate QR Code Data URI
	qrURL, err := utils.GenerateQRCodeDataURI(handoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate qr code: %w", err)
	}

	// 5. Check if Payment Gateway is required
	requirePaymentFlag, err := s.flagReader.GetFlag(ctx, "require_payment_gateway")
	requirePayment := true
	if err == nil && requirePaymentFlag != nil {
		requirePayment = requirePaymentFlag.IsEnabled
	}

	initialStatus := domain.StatusPendingPayment
	if !requirePayment {
		initialStatus = domain.StatusPendingAssignment
	}

	// 6. Create Order object
	order := &domain.Order{
		ID:                     uuid.New().String(),
		OrderNumber:            orderNum,
		CustomerID:             userID,
		Model:                  estimate.Model,
		Status:                 initialStatus,
		PickupAddress:          estimate.PickupAddress,
		PickupLat:              estimate.PickupLat,
		PickupLng:              estimate.PickupLng,
		DropoffAddress:         estimate.DropoffAddress,
		DropoffLat:             estimate.DropoffLat,
		DropoffLng:             estimate.DropoffLng,
		Length:                 estimate.Length,
		Width:                  estimate.Width,
		Height:                 estimate.Height,
		Weight:                 estimate.Weight,
		ItemDescription:        req.ItemDescription,
		ItemCategory:           req.Category,
		ItemImageURL:           req.ItemImageURL,
		DistanceKM:             estimate.DistanceKM,
		IncludedDistanceKM:     estimate.IncludedDistanceKM,
		DistanceFeeIDR:         estimate.DistanceFeeIDR,
		BasePriceIDR:           estimate.BasePriceIDR,
		VolumetricWeightKG:     estimate.VolumetricWeightKG,
		VolumetricSurchargeIDR: estimate.VolumetricSurchargeIDR,
		DynamicPriceIDR:        estimate.DynamicPriceIDR,
		SurgeFeeIDR:            estimate.SurgeFeeIDR,
		DiscountIDR:            estimate.DiscountIDR,
		PromoCode:              estimate.PromoCode,
		PromoSponsor:           estimate.PromoSponsor,
		SurgeMultiplier:        estimate.SurgeMultiplier,
		WeatherMultiplier:      estimate.WeatherMultiplier,
		TrafficMultiplier:      estimate.TrafficMultiplier,
		TotalPriceIDR:          estimate.TotalPriceIDR,
		PlatformFeeIDR:         estimate.PlatformFeeIDR,
		PlatformFeePct:         estimate.PlatformFeePct,
		PromoSubsidyIDR:        estimate.PromoSubsidyIDR,
		ReceiverName:           req.ReceiverName,
		ReceiverPhone:          req.ReceiverPhone,
		HandoverToken:          handoverToken,
		QRCodeURL:              qrURL,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
		QuoteID:                req.EstimateID,
		CorrelationID:          uuid.New().String(),
	}
	if snapBytes, errSnap := json.Marshal(estimate); errSnap == nil {
		order.PricingSnapshot = string(snapBytes)
	}

	// 5.b Calculate Tax Snapshot for On-Demand (isAggregator = false)
	taxSnapshot, err := s.taxSvc.CalculateOrderTax(ctx, estimate.TotalPriceIDR, estimate.PlatformFeeIDR, false)
	if err == nil {
		order.TaxRuleCode = taxSnapshot.TaxRuleCode
		order.PPNRateEffectivePct = taxSnapshot.PPNRateEffectivePct
		order.PPNRateStatutoryPct = taxSnapshot.PPNRateStatutoryPct
		order.DPPIDR = taxSnapshot.DPPIDR
		order.PPNIDR = taxSnapshot.PPNIDR
		order.TaxInvoiceRequired = taxSnapshot.TaxInvoiceRequired
		order.TaxInvoiceStatus = taxSnapshot.TaxInvoiceStatus
	}

	// 5.c FB-078: apply voucher diskon (kalau ada) — zero-trust server-side.
	// Tidak bisa digabung dengan promo lain (estimate.DiscountIDR != 0).
	var voucherUsage *domain.VoucherValidationResult
	if req.VoucherCode != "" && s.voucherSvc != nil {
		if order.DiscountIDR > 0 {
			return nil, fmt.Errorf("voucher tidak bisa digabung dengan promo lain")
		}
		baseIDR := order.DynamicPriceIDR + order.DistanceFeeIDR
		// Validate dulu (tanpa catat usage) — usage dicatat SETELAH order tersimpan.
		vres, verr := s.voucherSvc.Validate(ctx, req.VoucherCode, userID, baseIDR, order.Model)
		if verr != nil {
			return nil, fmt.Errorf("voucher: %w", verr)
		}
		if !vres.Valid {
			return nil, fmt.Errorf("voucher tidak valid: %s", vres.Error)
		}
		discount := vres.DiscountIDR
		if discount > order.TotalPriceIDR {
			discount = order.TotalPriceIDR
		}
		order.DiscountIDR += discount
		order.PromoCode = req.VoucherCode
		order.TotalPriceIDR -= discount
		voucherUsage = vres
	}

	// 6. Save to DB
	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to save order: %w", err)
	}

	// 6.b Catat pemakaian voucher SETELAH order sukses dibuat — kalau order
	// gagal, voucher tidak hangus (single-use tetap valid utk retry).
	if voucherUsage != nil {
		if oid, errO := uuid.Parse(order.ID); errO == nil {
			if uid, errU := uuid.Parse(order.CustomerID); errU == nil {
				_ = s.voucherSvc.RecordUsage(ctx, voucherUsage.VoucherID, oid, uid, voucherUsage.DiscountIDR)
			}
		}
	}

	// 7. Publish and Persist creation event
	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    order.Status,
		Message:   "Order created, awaiting payment",
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	// 8. Push to persistent task queue
	if s.taskQueue != nil {
		_ = s.taskQueue.Push(ctx, queue.Task{
			Type: "order.created",
			Payload: map[string]interface{}{
				"order_id": order.ID,
				"user_id":  order.CustomerID,
			},
		})
	}

	if !requirePayment {
		if err := s.StartMatching(ctx, order.ID); err != nil {
			log.Printf("Failed to start matching for order %s: %v", order.ID, err)
		} else {
			order.Status = domain.StatusSearching
		}
	}

	return order, nil
}

func (s *orderServiceImpl) CreateInternalAggregatorOrder(ctx context.Context, userID string, req domain.CreateOrderRequest) (*domain.Order, error) {
	orderNum := fmt.Sprintf("TMBS%s", strings.ToUpper(uuid.New().String()[:6]))
	handoverToken := uuid.New().String()

	qrURL, err := utils.GenerateQRCodeDataURI(handoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate qr code: %w", err)
	}

	order := &domain.Order{
		ID:                   uuid.New().String(),
		OrderNumber:          orderNum,
		CustomerID:           userID,
		Model:                "aggregator", // Model khusus untuk 3PL
		Status:               domain.StatusPendingAssignment,
		PickupAddress:        req.PickupAddress,
		PickupCity:           req.PickupCity,
		PickupZipCode:        req.PickupZipCode,
		PickupLat:            req.PickupLat,
		PickupLng:            req.PickupLng,
		DropoffAddress:       req.DropoffAddress,
		DropoffCity:          req.DropoffCity,
		DropoffZipCode:       req.DropoffZipCode,
		DropoffLat:           req.DropoffLat,
		DropoffLng:           req.DropoffLng,
		Weight:               1.0, // Default untuk paket UMKM
		ItemDescription:      req.ItemDescription,
		ItemImageURL:         req.ItemImageURL,
		LogisticsProvider:    req.LogisticsProvider,
		LogisticsServiceType: req.LogisticsServiceType,
		LogisticsTariffIDR:   req.LogisticsTariffIDR,
		LogisticsNetCostIDR:  req.LogisticsNetCostIDR,
		TotalPriceIDR:        req.LogisticsTariffIDR, // Harga yang dibayar user = tariff user
		ReceiverName:         req.ReceiverName,
		ReceiverPhone:        req.ReceiverPhone,
		HandoverToken:        handoverToken,
		QRCodeURL:            qrURL,
		PlatformFeeIDR:       req.LogisticsTariffIDR - req.LogisticsNetCostIDR,
		CorrelationID:        uuid.New().String(),
		CreatedAt:            time.Now(),
		UpdatedAt:            time.Now(),
	}

	// 5.b Calculate Tax Snapshot for Aggregator 3PL (isAggregator = true)
	taxSnapshot, err := s.taxSvc.CalculateOrderTax(ctx, order.TotalPriceIDR, order.PlatformFeeIDR, true)
	if err == nil {
		order.TaxRuleCode = taxSnapshot.TaxRuleCode
		order.PPNRateEffectivePct = taxSnapshot.PPNRateEffectivePct
		order.PPNRateStatutoryPct = taxSnapshot.PPNRateStatutoryPct
		order.DPPIDR = taxSnapshot.DPPIDR
		order.PPNIDR = taxSnapshot.PPNIDR
		order.TaxInvoiceRequired = taxSnapshot.TaxInvoiceRequired
		order.TaxInvoiceStatus = taxSnapshot.TaxInvoiceStatus
	}

	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to save aggregator order: %w", err)
	}

	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    order.Status,
		Message:   fmt.Sprintf("Order 3PL dibuat via %s", req.LogisticsProvider),
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	if s.taskQueue != nil {
		_ = s.taskQueue.Push(ctx, queue.Task{
			Type: "order.created",
			Payload: map[string]interface{}{
				"order_id":           order.ID,
				"user_id":            order.CustomerID,
				"logistics_provider": req.LogisticsProvider,
			},
		})
	}

	return order, nil
}

func (s *orderServiceImpl) CreateBulkOrder(ctx context.Context, userID string, req domain.CreateBulkOrderRequest) ([]*domain.Order, string, error) {
	if len(req.Destinations) < 2 {
		return nil, "", fmt.Errorf("bulk order requires at least 2 destinations")
	}

	batchID := uuid.New().String()
	var createdOrders []*domain.Order

	for i, dest := range req.Destinations {
		// 1. Get cached estimate
		estimate, err := s.redisRepo.GetEstimate(ctx, dest.EstimateID)
		if err != nil {
			return nil, "", fmt.Errorf("invalid estimate for destination %d: %w", i+1, err)
		}
		if estimate.ExpiresAt.IsZero() || !estimate.ExpiresAt.After(time.Now()) {
			return nil, "", &domain.RequoteRequiredError{
				Reason:  fmt.Sprintf("quote tujuan %d sudah kedaluwarsa", i+1),
				QuoteID: estimate.QuoteIDOrEstimateID(),
			}
		}

		if req.IsScheduled {
			scheduledEnabled, _ := s.flagReader.IsFeatureFlagEnabled(ctx, "scheduled_delivery", false)
			if !scheduledEnabled {
				return nil, "", fmt.Errorf("Feature Scheduled Delivery is disabled")
			}
		}

		// Only allow specific models for bulk order
		if estimate.Model != "tembus_sameday" && estimate.Model != "tembus_mobil" {
			return nil, "", fmt.Errorf("bulk order only supported for TEMBUS Sameday and TEMBUS Mobil")
		}

		// 2. Check Feature Flag
		flag, err := s.flagReader.GetFlag(ctx, estimate.Model)
		if err != nil || flag == nil || !flag.IsEnabled {
			return nil, "", &domain.ModelUnavailableError{
				Model:     estimate.Model,
				MessageID: "MODEL_UNAVAILABLE",
				UserMsg:   "The selected delivery model is no longer available",
			}
		}

		// Generate Order Number (TMBS + 6 Alphanumeric)
		orderNum := fmt.Sprintf("TMBS%s", strings.ToUpper(uuid.New().String()[:6]))
		handoverToken := uuid.New().String()
		qrURL, _ := utils.GenerateQRCodeDataURI(handoverToken, 256)

		requirePaymentFlag, err := s.flagReader.GetFlag(ctx, "require_payment_gateway")
		requirePayment := true
		if err == nil && requirePaymentFlag != nil {
			requirePayment = requirePaymentFlag.IsEnabled
		}

		initialStatus := domain.StatusPendingPayment
		if !requirePayment {
			initialStatus = domain.StatusPendingAssignment
		}

		seq := i + 1
		order := &domain.Order{
			ID:                     uuid.New().String(),
			OrderNumber:            orderNum,
			CustomerID:             userID,
			Model:                  estimate.Model,
			Status:                 initialStatus,
			PickupAddress:          estimate.PickupAddress,
			PickupLat:              estimate.PickupLat,
			PickupLng:              estimate.PickupLng,
			DropoffAddress:         estimate.DropoffAddress,
			DropoffLat:             estimate.DropoffLat,
			DropoffLng:             estimate.DropoffLng,
			Length:                 estimate.Length,
			Width:                  estimate.Width,
			Height:                 estimate.Height,
			Weight:                 estimate.Weight,
			ItemDescription:        dest.ItemDescription,
			ItemImageURL:           dest.ItemImageURL,
			DistanceKM:             estimate.DistanceKM,
			IncludedDistanceKM:     estimate.IncludedDistanceKM,
			DistanceFeeIDR:         estimate.DistanceFeeIDR,
			BasePriceIDR:           estimate.BasePriceIDR,
			VolumetricWeightKG:     estimate.VolumetricWeightKG,
			VolumetricSurchargeIDR: estimate.VolumetricSurchargeIDR,
			DynamicPriceIDR:        estimate.DynamicPriceIDR,
			SurgeFeeIDR:            estimate.SurgeFeeIDR,
			DiscountIDR:            estimate.DiscountIDR,
			PromoCode:              estimate.PromoCode,
			PromoSponsor:           estimate.PromoSponsor,
			SurgeMultiplier:        estimate.SurgeMultiplier,
			WeatherMultiplier:      estimate.WeatherMultiplier,
			TrafficMultiplier:      estimate.TrafficMultiplier,
			TotalPriceIDR:          estimate.TotalPriceIDR,
			PlatformFeeIDR:         estimate.PlatformFeeIDR,
			PlatformFeePct:         estimate.PlatformFeePct,
			PromoSubsidyIDR:        estimate.PromoSubsidyIDR,
			// FK tax_rules — set default PPN_11 (valid) supaya insert tidak
			// melanggar orders_tax_rule_code_fkey (empty string ≠ NULL).
			TaxRuleCode:   "PPN_11",
			HandoverToken: handoverToken,
			QRCodeURL:     qrURL,
			BatchID:       &batchID,
			SequenceNo:    &seq,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
			QuoteID:       dest.EstimateID,
			CorrelationID: uuid.New().String(),
		}
		if snapBytes, errSnap := json.Marshal(estimate); errSnap == nil {
			order.PricingSnapshot = string(snapBytes)
		}

		if err := s.orderRepo.Create(ctx, order); err != nil {
			return nil, "", fmt.Errorf("failed to save order for destination %d: %w", i+1, err)
		}

		event := domain.OrderEvent{
			OrderID:   order.ID,
			UserID:    order.CustomerID,
			Status:    order.Status,
			Message:   "Bulk Order created, awaiting payment",
			CreatedAt: time.Now(),
		}
		_ = s.eventRepo.SaveEvent(ctx, event)
		_ = s.eventBus.Publish(ctx, "order.updates", event)

		if s.taskQueue != nil {
			_ = s.taskQueue.Push(ctx, queue.Task{
				Type: "order.created",
				Payload: map[string]interface{}{
					"order_id": order.ID,
					"user_id":  order.CustomerID,
				},
			})
		}

		if !requirePayment {
			if err := s.StartMatching(ctx, order.ID); err != nil {
				log.Printf("Failed to start matching for bulk order %s: %v", order.ID, err)
			} else {
				order.Status = domain.StatusSearching
			}
		}

		createdOrders = append(createdOrders, order)
	}

	return createdOrders, batchID, nil
}
