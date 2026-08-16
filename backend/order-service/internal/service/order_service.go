package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/domain/queue"
	"tembus/order-service/internal/featureflags"
	"tembus/order-service/pkg/alerting"
	"tembus/order-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

type orderServiceImpl struct {
	orderRepo       domain.OrderRepository
	eventRepo       domain.OrderEventRepository
	redisRepo       domain.RedisRepository
	pricingRepo     domain.PricingRepository
	relayRepo       domain.RelayRepository
	eventBus        domain.EventBus
	taskQueue       queue.Queue
	flagReader      featureflags.FlagReader
	notificationSvc domain.NotificationService
	configRepo      domain.ConfigRepository
	refundSvc       domain.RefundService
	reportSvc       domain.ServiceReportService
	ledgerRepo      domain.FinanceLedgerRepository
	taxSvc          domain.TaxService
	foodRepo        domain.FoodRepository
	settlementSvc   domain.MerchantSettlementService
	pointsSvc       domain.DriverPointsService
	penaltySvc      domain.DriverPenaltyService
	voucherSvc      domain.VoucherService
	tipSvc          domain.TipService  // FB-083: refund tip saat order batal
	pushSvc         domain.PushService // FB-084: notif push customer saat merchant reject/timeout
}

func NewOrderService(o domain.OrderRepository, er domain.OrderEventRepository, r domain.RedisRepository, p domain.PricingRepository, relayRepo domain.RelayRepository, eb domain.EventBus, tq queue.Queue, f featureflags.FlagReader, ns domain.NotificationService, cr domain.ConfigRepository, lr domain.FinanceLedgerRepository, ts domain.TaxService) domain.OrderService {
	return &orderServiceImpl{
		orderRepo:       o,
		eventRepo:       er,
		redisRepo:       r,
		pricingRepo:     p,
		relayRepo:       relayRepo,
		eventBus:        eb,
		taskQueue:       tq,
		flagReader:      f,
		notificationSvc: ns,
		configRepo:      cr,
		ledgerRepo:      lr,
		taxSvc:          ts,
	}
}

func (s *orderServiceImpl) SetRefundService(rs domain.RefundService) {
	s.refundSvc = rs
}

func (s *orderServiceImpl) SetTipService(ts domain.TipService) {
	s.tipSvc = ts
}

func (s *orderServiceImpl) SetPushService(ps domain.PushService) {
	s.pushSvc = ps
}

// SetMerchantSettlementService inject settlement service (FOOD-BIKE-067).
// Dipanggil dari ScanPackage saat order food delivered tanpa payment link.
func (s *orderServiceImpl) SetMerchantSettlementService(mss domain.MerchantSettlementService) {
	s.settlementSvc = mss
}

// SetDriverIncentiveServices inject points + penalty service (FOOD-BIKE-068).
// Points ditambah saat order food delivered; penalty dipakai anti-ghosting.
func (s *orderServiceImpl) SetDriverIncentiveServices(pts domain.DriverPointsService, pen domain.DriverPenaltyService) {
	s.pointsSvc = pts
	s.penaltySvc = pen
}

func (s *orderServiceImpl) SetServiceReportService(reportSvc domain.ServiceReportService) {
	s.reportSvc = reportSvc
}

// SetFoodRepository — inject food repository (FOOD-BIKE-073).
// Dipanggil dari wiring setelah service di-construct.
func (s *orderServiceImpl) SetFoodRepository(fr domain.FoodRepository) {
	s.foodRepo = fr
}

// SetVoucherService — inject voucher service (FB-078).
// Dipanggil dari wiring setelah service di-construct.
func (s *orderServiceImpl) SetVoucherService(vs domain.VoucherService) {
	s.voucherSvc = vs
}

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

// createAggregatorOrder membuat order untuk pengiriman 3PL (JNE/J&T).
// Tidak membutuhkan Redis estimate — semua data diambil langsung dari CreateOrderRequest.
// Status awal: pending_assignment (AWB akan di-generate terpisah oleh payment_link webhook).
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
			TaxRuleCode:            "PPN_11",
			HandoverToken:          handoverToken,
			QRCodeURL:              qrURL,
			BatchID:                &batchID,
			SequenceNo:             &seq,
			CreatedAt:              time.Now(),
			UpdatedAt:              time.Now(),
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

func (s *orderServiceImpl) GetOrder(ctx context.Context, orderID string) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}

	// Fetch Courier Info if order is assigned
	if order.CourierID != nil && *order.CourierID != "" {
		courierInfo, err := s.orderRepo.GetCourierInfo(ctx, *order.CourierID)
		if err == nil && courierInfo != nil {
			order.Courier = courierInfo
		}
	}

	// Generate QR Code URL for the detail view
	qrURL, _ := utils.GenerateQRCodeDataURI(order.HandoverToken, 256)
	order.QRCodeURL = qrURL

	// Fetch Service Reports for Tambal Ban or Towing
	if s.reportSvc != nil {
		serviceCode := strings.ToLower(order.ServiceSubType)
		if serviceCode == "" {
			serviceCode = order.ServiceCode
		}
		switch {
		case strings.HasPrefix(serviceCode, "tambal_ban"):
			report, err := s.reportSvc.GetTambalBanReport(ctx, orderID)
			if err == nil && report != nil {
				order.TambalBanReport = report
			}
		case strings.HasPrefix(serviceCode, "towing"):
			report, err := s.reportSvc.GetTowingReport(ctx, orderID)
			if err == nil && report != nil {
				order.TowingReport = report
			}
		}
	}

	return order, nil
}

func (s *orderServiceImpl) ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	return s.orderRepo.ListByUserID(ctx, userID, filter)
}

func (s *orderServiceImpl) GetCourierIDByUserID(ctx context.Context, userID string) (string, error) {
	return s.orderRepo.GetCourierIDByUserID(ctx, userID)
}

func (s *orderServiceImpl) UpdateStatus(ctx context.Context, orderID string, status domain.OrderStatus) error {
	// FB-081: tangkap status lama SEBELUM update — dipakai sbg original_status
	// refund. Tanpa ini, order sudah berstatus cancelled saat refund dihitung
	// → food cancel lewat jalur ini dihitung 0% (salah untuk pending_merchant dll).
	var prevStatus domain.OrderStatus
	prevOrder, errPrev := s.orderRepo.GetByID(ctx, orderID)
	if errPrev == nil && prevOrder != nil {
		prevStatus = prevOrder.Status
	}

	// AUDIT-FIX m5: guard transisi terakhir (defense in depth) —
	// 1) idempotent: target == status sekarang → no-op, JANGAN trigger
	//    refund/event dua kali (order sudah cancelled, dana sudah kembali).
	// 2) status final (delivered/cancelled) TIDAK boleh berubah lagi —
	//    membunuh resurrection via endpoint generic (order delivered →
	//    di-cancel → refund order selesai; order cancelled → di-delivered).
	if prevOrder != nil {
		if prevOrder.Status == status {
			return nil
		}
		if (prevOrder.Status == domain.StatusDelivered || prevOrder.Status == domain.StatusCancelled) &&
			status != prevOrder.Status {
			return fmt.Errorf("order %s sudah berstatus final (%s), tidak bisa diubah ke %s",
				orderID, prevOrder.Status, status)
		}
	}

	err := s.orderRepo.UpdateStatus(ctx, orderID, status)
	if err != nil {
		return err
	}

	// FB-121: order selesai → leg aktif ikut final. Kalau tidak, leg status
	// (`accepted`) tidak pernah settle → gate active_jobs dispatch menghitung
	// courier masih punya pekerjaan → courier tak dapat offer baru.
	if status == domain.StatusDelivered || status == domain.StatusCancelled {
		_ = s.orderRepo.UpdateLegsStatus(ctx, orderID, status)
	}

	// Fetch order to get UserID for the event
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err == nil {
		event := domain.OrderEvent{
			OrderID:   order.ID,
			UserID:    order.CustomerID,
			Status:    status,
			Message:   fmt.Sprintf("Order status updated to %s", status),
			CreatedAt: time.Now(),
		}
		_ = s.eventRepo.SaveEvent(ctx, event)
		_ = s.eventBus.Publish(ctx, "order.updates", event)

		// Push to task queue for persistent background processing (notifications)
		if s.taskQueue != nil {
			_ = s.taskQueue.Push(ctx, queue.Task{
				Type: "order.status_updated",
				Payload: map[string]interface{}{
					"order_id": order.ID,
					"user_id":  order.CustomerID,
					"status":   string(status),
				},
			})
		}

		if status == domain.StatusCancelled && s.refundSvc != nil {
			if oid, errParse := uuid.Parse(orderID); errParse == nil {
				log.Printf("[OrderService] Order %s cancelled, triggering automatic refund...", orderID)
				_, errRefund := s.refundSvc.CalculateAndTriggerRefund(ctx, oid, "Order cancelled", domain.RefundOptions{OriginalStatus: prevStatus})
				if errRefund != nil {
					log.Printf("[OrderService] Failed to trigger refund for order %s: %v", orderID, errRefund)
				}
			}
		}

		// FB-083: order batal → tip yang sudah dibayar dikembalikan ke customer
		// (fire-and-forget: error hanya di-log, tidak menggagalkan cancel flow).
		if status == domain.StatusCancelled && s.tipSvc != nil {
			if oid, errParse := uuid.Parse(orderID); errParse == nil {
				if errTip := s.tipSvc.RefundTipByOrder(ctx, oid); errTip != nil {
					log.Printf("[OrderService] Failed to refund tip for cancelled order %s: %v", orderID, errTip)
				} else {
					log.Printf("[OrderService] Tip refunded for cancelled order %s", orderID)
				}
			}
		}
	}

	return nil
}

func (s *orderServiceImpl) UpdateDimensions(ctx context.Context, id string, length, width, height, weight *float64) error {
	order, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", id)
	}

	l := order.Length
	if length != nil {
		l = *length
	}
	w := order.Width
	if width != nil {
		w = *width
	}
	h := order.Height
	if height != nil {
		h = *height
	}
	wt := order.Weight
	if weight != nil {
		wt = *weight
	}

	return s.orderRepo.UpdateDimensions(ctx, id, l, w, h, wt)
}

func (s *orderServiceImpl) AcceptOrder(ctx context.Context, orderID string, courierID string) error {
	// 1. Check order status
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	// Only allow acceptance if searching (initial match) or failed_delivery (retry)
	if order.Status != domain.StatusSearching && order.Status != domain.StatusFailedDelivery {
		return fmt.Errorf("order cannot be accepted in current status: %s", order.Status)
	}

	var batchOrders []*domain.Order
	if order.BatchID != nil {
		batchOrders, err = s.orderRepo.GetByBatchID(ctx, *order.BatchID)
		if err != nil || len(batchOrders) == 0 {
			batchOrders = []*domain.Order{order}
		}
	} else {
		batchOrders = []*domain.Order{order}
	}

	// Assign courier to all orders in the batch
	for _, o := range batchOrders {
		if o.Status == domain.StatusSearching {
			// 2. Assign Courier in DB
			err = s.orderRepo.AssignCourier(ctx, o.ID, courierID)
			if err != nil {
				log.Printf("failed to assign courier to order %s: %v", o.ID, err)
				continue
			}

			// 3. Update Status to Accepted
			err = s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusAccepted)
			if err != nil {
				log.Printf("failed to update status for order %s: %v", o.ID, err)
				continue
			}

			// 4. Record Event
			event := domain.OrderEvent{
				OrderID:   o.ID,
				UserID:    o.CustomerID,
				Status:    domain.StatusAccepted,
				Message:   "Courier has accepted your order",
				CreatedAt: time.Now(),
			}
			_ = s.eventRepo.SaveEvent(ctx, event)
			_ = s.eventBus.Publish(ctx, "order.updates", event)

			// FB-124: notif customer bahwa driver sudah di-assign (hanya
			// order food — parcel sudah dapat notif "order_accepted" di atas).
			// Fire-and-forget — gagal kirim hanya di-log.
			if o.MerchantID != nil && s.pushSvc != nil {
				if errPush := s.pushSvc.NotifyCustomerDriverAssigned(ctx, o.ID, "Driver ditemukan — sedang menuju merchant"); errPush != nil {
					log.Printf("[OrderService] FB-124 push driver_assigned gagal order %s: %v", o.ID, errPush)
				}
			}

			// 5. Notify Customer
			_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
				UserID:  o.CustomerID,
				Title:   "Courier Found!",
				Message: "A courier has accepted your order and is heading to the pickup location.",
				Channel: domain.ChannelPush,
				Data: map[string]string{
					"order_id": o.ID,
					"type":     "order_accepted",
				},
			})
		}
	}

	// FB-088: kalau batch ini adalah food batch → tandai courier di
	// food_batches (forming → assigned). Tidak fatal kalau batch parcel biasa.
	if order.BatchID != nil && s.foodRepo != nil {
		if err := s.foodRepo.UpdateFoodBatchCourier(ctx, *order.BatchID, courierID); err != nil {
			log.Printf("failed to update food batch courier %s: %v", *order.BatchID, err)
		}
	}

	return nil
}

func (s *orderServiceImpl) FindAndAssignCourier(ctx context.Context, orderID string) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}

	if order.Status != domain.StatusSearching {
		return fmt.Errorf("order is not in searching status: %s", order.Status)
	}

	totalWeight := order.Weight
	packageCount := 1
	var batchOrders []*domain.Order

	if order.BatchID != nil {
		batchOrders, err = s.orderRepo.GetByBatchID(ctx, *order.BatchID)
		if err == nil && len(batchOrders) > 0 {
			packageCount = len(batchOrders)
			totalWeight = 0
			for _, o := range batchOrders {
				totalWeight += o.Weight
			}
		}
	} else {
		batchOrders = []*domain.Order{order}
	}

	// Cascading search radius: dynamic from service product or default 3km, 5km, 10km
	radii := []float64{3, 5, 10}
	if serviceProduct, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, order.Model); err == nil && len(serviceProduct.SearchRadiiKM) > 0 {
		radii = serviceProduct.SearchRadiiKM
	}

	// S2-OS-02: Ganti time.Sleep(30s) blocking dengan polling loop
	// (1 detik interval) + context cancellation. Ini mencegah goroutine
	// stuck dan memberi customer progress visibility.
	const (
		batchOfferTimeout = 15 * time.Second // synced with ON_DEMAND_OFFER_TTL_SECONDS (15s)
		pollInterval      = 1 * time.Second
		batchSize         = 3
	)

	for _, radius := range radii {
		// Check context cancellation before each radius attempt
		select {
		case <-ctx.Done():
			return fmt.Errorf("matching cancelled: %w", ctx.Err())
		default:
		}

		courierIDs, err := s.redisRepo.FindNearbyCouriers(ctx, order.PickupLat, order.PickupLng, radius)
		if err != nil || len(courierIDs) == 0 {
			log.Printf("[Matching] No couriers in %.0fkm radius for order %s", radius, order.OrderNumber)
			continue
		}

		log.Printf("[Matching] Found %d couriers in %.0fkm radius for order %s",
			len(courierIDs), radius, order.OrderNumber)

		// 1. Score and Sort Couriers
		scoredCouriers := s.scoreCouriers(ctx, courierIDs, order, totalWeight, packageCount)

		// 2. Batch Dispatch: Try top 3 couriers simultaneously
		for i := 0; i < len(scoredCouriers); i += batchSize {
			end := i + batchSize
			if end > len(scoredCouriers) {
				end = len(scoredCouriers)
			}
			batch := scoredCouriers[i:end]

			// Set dispatch expiry for the batch
			expiry := time.Now().Add(batchOfferTimeout)
			for _, o := range batchOrders {
				if err := s.orderRepo.SetDispatchExpiry(ctx, o.ID, expiry); err != nil {
					log.Printf("Failed to set dispatch expiry for order %s: %v", o.ID, err)
				}
			}

			// Notify all couriers in the batch
			for _, sc := range batch {
				s.notifyCourierOfNewOrder(ctx, sc.ID, order, packageCount)
			}

			// ── Polling wait instead of time.Sleep ─────────────────
			// Poll every 1s for courier acceptance or timeout.
			// Context cancellation lets the caller abort early.
			deadline := time.After(batchOfferTimeout)
			ticker := time.NewTicker(pollInterval)
			accepted := false

		pollLoop:
			for {
				select {
				case <-ctx.Done():
					ticker.Stop()
					return fmt.Errorf("matching cancelled: %w", ctx.Err())
				case <-deadline:
					ticker.Stop()
					break pollLoop
				case <-ticker.C:
					updatedOrder, err := s.orderRepo.GetByID(ctx, orderID)
					if err == nil && updatedOrder.Status != domain.StatusSearching {
						// Order was accepted by someone!
						accepted = true
						ticker.Stop()
						break pollLoop
					}
				}
			}

			if accepted {
				return nil
			}

			// Batch expired — continue to next batch if available
		}

		// Small delay before next radius
		select {
		case <-ctx.Done():
			return fmt.Errorf("matching cancelled: %w", ctx.Err())
		case <-time.After(500 * time.Millisecond):
		}
	}

	// If no courier found after all radii and batches
	s.notifyCustomerNoCourier(ctx, order)

	// Set order status to no_courier_found if all declined/expired
	for _, o := range batchOrders {
		_ = s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusNoCourierFound)
	}

	return errors.New("no couriers accepted the order within the search window")
}

type scoredCourier struct {
	ID       string
	Score    float64
	TierRank int
}

func (s *orderServiceImpl) scoreCouriers(ctx context.Context, courierIDs []string, order *domain.Order, totalWeight float64, packageCount int) []scoredCourier {
	scored := make([]scoredCourier, 0, len(courierIDs))
	for _, id := range courierIDs {
		courierUUID, err := uuid.Parse(id)
		if err != nil {
			log.Printf("Skipping courier %s: invalid UUID from courier location index", id)
			continue
		}
		stats, err := s.relayRepo.GetCourierDispatchScoreStats(ctx, courierUUID, order.PickupLat, order.PickupLng)
		if err != nil {
			log.Printf("Skipping courier %s: dispatch score stats unavailable: %v", id, err)
			continue
		}

		// Basecamp Photo Lock Check
		if !stats.ProfilePhotoLocked {
			log.Printf("Skipping courier %s: profile photo has not been locked at basecamp yet", id)
			continue
		}

		// Capacity filtering
		if stats.MaxWeightCapacityKg != nil && totalWeight > *stats.MaxWeightCapacityKg {
			log.Printf("Skipping courier %s: total batch weight (%f kg) exceeds max capacity (%f kg)", id, totalWeight, *stats.MaxWeightCapacityKg)
			continue
		}

		if stats.MaxPackagesCapacity != nil && packageCount > *stats.MaxPackagesCapacity {
			log.Printf("Skipping courier %s: order packages (%d) exceeds max capacity (%d)", id, packageCount, *stats.MaxPackagesCapacity)
			continue
		}

		relayWeight := s.configRepo.GetFloatConfig(ctx, "relay_score_weight", 0.4)
		proximityWeight := s.configRepo.GetFloatConfig(ctx, "proximity_score_weight", 0.25)
		acceptanceWeight := s.configRepo.GetFloatConfig(ctx, "acceptance_score_weight", 0.15)
		idleWeight := s.configRepo.GetFloatConfig(ctx, "idle_time_weight", 0.1)
		ratingWeight := s.configRepo.GetFloatConfig(ctx, "rating_score_weight", 0.1)

		// S3-OS-01: Rating minimum threshold — kurir rating < 3.5 difilter
		minRating := s.configRepo.GetFloatConfig(ctx, "min_courier_rating_threshold", 3.5)
		if stats.AvgRating < minRating {
			log.Printf("Skipping courier %s: avg rating %.1f below threshold %.1f", id, stats.AvgRating, minRating)
			continue
		}

		relayScore := clampFloat(stats.RelayScore, 0, 5) / 5
		acceptanceRate := clampFloat(stats.AcceptanceRatePct, 0, 100) / 100
		proximityScore := s.proximityScoreFromDistance(ctx, stats.DistanceMeters)

		// S3-OS-02: Idle time bonus — kurir yang lama nunggu diprioritaskan
		// Idle 0 menit = 0, idle 30+ menit = 1 (full bonus)
		idleScore := clampFloat(stats.IdleMinutes/30.0, 0, 1)

		// Rating score: 1.0-5.0 dinormalisasi ke 0-1
		ratingScore := clampFloat(stats.AvgRating, 1.0, 5.0) / 5.0

		score := (relayScore * relayWeight) +
			(proximityScore * proximityWeight) +
			(acceptanceRate * acceptanceWeight) +
			(idleScore * idleWeight) +
			(ratingScore * ratingWeight)

		var tierRank int
		switch stats.Tier {
		case "god_mode":
			tierRank = 4
		case "gold":
			tierRank = 3
		case "silver":
			tierRank = 2
		default:
			tierRank = 1
		}

		scored = append(scored, scoredCourier{ID: id, Score: score, TierRank: tierRank})
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].TierRank != scored[j].TierRank {
			return scored[i].TierRank > scored[j].TierRank
		}
		return scored[i].Score > scored[j].Score
	})
	return scored
}

func clampFloat(value float64, minValue float64, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func (s *orderServiceImpl) proximityScoreFromDistance(ctx context.Context, distanceMeters float64) float64 {
	if distanceMeters <= 0 {
		return 1
	}

	maxRadius := s.configRepo.GetFloatConfig(ctx, "max_proximity_radius_m", 10000.0)
	if maxRadius <= 0 {
		maxRadius = 10000.0
	}

	score := 1 - (distanceMeters / maxRadius)
	return clampFloat(score, 0, 1)
}

func (s *orderServiceImpl) notifyCourierOfNewOrder(ctx context.Context, courierID string, order *domain.Order, packageCount int) {
	log.Printf("[OrderService] Notifying courier %s of new order %s", courierID, order.OrderNumber)

	title := "New Order Available"
	msg := fmt.Sprintf("New order %s is available nearby. Tap to view details.", order.OrderNumber)
	if packageCount > 1 {
		title = "New Multi-Stop Order"
		msg = fmt.Sprintf("New batch order (%d packages) is available nearby. Tap to view details.", packageCount)
	}

	payload := domain.NotificationRequest{
		UserID:  courierID,
		Title:   title,
		Message: msg,
		Data: map[string]string{
			"order_id": order.ID,
			"type":     "new_order",
		},
	}

	// 1. Send Push Notification
	pushReq := payload
	pushReq.Channel = domain.ChannelPush
	if err := s.notificationSvc.Send(ctx, pushReq); err != nil {
		log.Printf("Failed to send Push to courier %s: %v", courierID, err)
	}

	// 2. Send WebSocket Notification
	wsReq := payload
	wsReq.Channel = domain.ChannelWebSocket
	if err := s.notificationSvc.Send(ctx, wsReq); err != nil {
		log.Printf("Failed to send WebSocket to courier %s: %v", courierID, err)
	}
}

func (s *orderServiceImpl) notifyCustomerNoCourier(ctx context.Context, order *domain.Order) {
	log.Printf("[OrderService] Notifying customer %s that no courier was found for order %s", order.CustomerID, order.OrderNumber)

	req := domain.NotificationRequest{
		UserID:  order.CustomerID,
		Title:   "No Courier Found",
		Message: fmt.Sprintf("Sorry, we couldn't find a courier for your order %s. Please try again in a few minutes.", order.OrderNumber),
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"order_id": order.ID,
			"type":     "no_courier",
		},
	}

	if err := s.notificationSvc.Send(ctx, req); err != nil {
		log.Printf("Failed to send notification to customer %s: %v", order.CustomerID, err)
	}

	_ = s.taskQueue.Push(ctx, queue.Task{
		Type: "order.no_courier_found",
		Payload: map[string]interface{}{
			"order_id": order.ID,
			"user_id":  order.CustomerID,
		},
	})

	// LAUNCH-3: Alert on no-driver-found for ops visibility
	go func() {
		alerting.AlertNoDriverFound(100, 1, 1) // Single event triggers immediate alert
	}()
}

func (s *orderServiceImpl) ListEvents(ctx context.Context, userID string, since time.Time) ([]domain.OrderEvent, error) {
	return s.eventRepo.ListEventsByUserID(ctx, userID, since)
}

func (s *orderServiceImpl) ScanPackage(ctx context.Context, scannedBy string, scan *domain.PackageScan) error {
	order, err := s.orderRepo.GetByID(ctx, scan.OrderID)
	if err != nil {
		return err
	}
	if order == nil {
		return errors.New("order not found")
	}

	var targetStatus domain.OrderStatus
	switch scan.ScanType {
	case "pickup":
		if order.Status != domain.StatusAccepted && order.Status != domain.StatusPickingUp {
			return fmt.Errorf("invalid state transition: cannot perform pickup on order in status %s", order.Status)
		}
		targetStatus = domain.StatusPickedUp
	case "inbound_origin":
		if order.Status != domain.StatusPickedUp {
			return fmt.Errorf("invalid state transition: cannot inbound to origin hub on order in status %s", order.Status)
		}
		targetStatus = domain.StatusInboundOrigin
	case "outbound_origin":
		if order.Status != domain.StatusInboundOrigin {
			return fmt.Errorf("invalid state transition: cannot outbound from origin hub on order in status %s", order.Status)
		}
		if scan.BagNumber != nil && *scan.BagNumber != "" {
			bag, err := s.orderRepo.GetConsolidationBag(ctx, *scan.BagNumber)
			if err != nil {
				return fmt.Errorf("failed to check consolidation bag: %w", err)
			}
			if bag == nil {
				return fmt.Errorf("consolidation bag %s not found. Please create and seal it first before bagging packages.", *scan.BagNumber)
			}
			if bag.Status != "sealed" {
				return fmt.Errorf("consolidation bag %s is not sealed (current status: %s). Only sealed bags can accept outbound package consolidation.", *scan.BagNumber, bag.Status)
			}
		}
		targetStatus = domain.StatusOutboundOrigin
	case "inbound_destination":
		if order.Status != domain.StatusOutboundOrigin {
			return fmt.Errorf("invalid state transition: cannot inbound to destination hub on order in status %s", order.Status)
		}
		// Retrieve package scans to find if this order was consolidated in a bag during outbound_origin
		scans, err := s.orderRepo.GetScansForOrder(ctx, order.ID)
		if err != nil {
			return fmt.Errorf("failed to retrieve package scans: %w", err)
		}
		var assocBagNumber *string
		for i := len(scans) - 1; i >= 0; i-- {
			if scans[i].ScanType == "outbound_origin" && scans[i].BagNumber != nil && *scans[i].BagNumber != "" {
				assocBagNumber = scans[i].BagNumber
				break
			}
		}
		if assocBagNumber != nil {
			bag, err := s.orderRepo.GetConsolidationBag(ctx, *assocBagNumber)
			if err != nil {
				return fmt.Errorf("failed to verify consolidation bag: %w", err)
			}
			if bag != nil && bag.Status == "sealed" {
				return fmt.Errorf("cannot inbound package. Consolidation bag %s must be unbagged (Bag Out) at destination first.", *assocBagNumber)
			}
		}
		targetStatus = domain.StatusInboundDestination
	case "outbound_destination":
		if order.Status != domain.StatusInboundDestination {
			return fmt.Errorf("invalid state transition: cannot outbound from destination hub on order in status %s", order.Status)
		}
		targetStatus = domain.StatusOutboundDestination
	case "out_for_delivery":
		if order.Status != domain.StatusOutboundDestination {
			return fmt.Errorf("invalid state transition: cannot dispatch for delivery on order in status %s", order.Status)
		}
		targetStatus = domain.StatusDelivering
	case "delivered":
		if order.Status != domain.StatusDelivering && order.Status != domain.StatusFailedDelivery {
			return fmt.Errorf("invalid state transition: cannot deliver order in status %s", order.Status)
		}
		targetStatus = domain.StatusDelivered
	// S2-OS-03: Failed delivery flow — courier reports "penerima tidak ada"
	// atau tolak terima. Transisi dari delivering (on-demand) atau
	// outbound_destination (regular). Admin/resolver kemudian bisa
	// trigger return_to_sender atau reschedule.
	case "failed_delivery":
		if order.Status != domain.StatusDelivering && order.Status != domain.StatusOutboundDestination {
			return fmt.Errorf("invalid state transition: cannot fail delivery on order in status %s", order.Status)
		}
		targetStatus = domain.StatusFailedDelivery
	case "return_to_sender":
		if order.Status != domain.StatusFailedDelivery {
			return fmt.Errorf("invalid state transition: can only return to sender from failed_delivery status, current: %s", order.Status)
		}
		targetStatus = domain.StatusReturnToSender
	default:
		return fmt.Errorf("unknown scan type: %s", scan.ScanType)
	}

	// 1. Update order status in DB
	err = s.orderRepo.UpdateStatus(ctx, order.ID, targetStatus)
	if err != nil {
		return fmt.Errorf("failed to update order status: %w", err)
	}

	// 2. Save scan log
	scan.ScannedBy = scannedBy
	err = s.orderRepo.SaveScan(ctx, scan)
	if err != nil {
		return fmt.Errorf("failed to save scan record: %w", err)
	}

	// 3. FIN-003 & FIN-005: Create Ledger Journal if Delivered (Revenue Recognition)
	if targetStatus == domain.StatusDelivered {
		// Calculate courier earnings based on order BasePrice + Volumetric + Dynamic
		grossTariff := order.BasePriceIDR + order.VolumetricSurchargeIDR + order.DynamicPriceIDR

		// 80% to courier (example, should be from config but we'll use standard model)
		// For simplicity we just use 80% of grossTariff for courier payable
		courierPayable := int64(float64(grossTariff) * 0.8)

		journal := &domain.LedgerJournal{
			JournalType:    "order_delivered",
			ReferenceType:  "order",
			ReferenceID:    order.ID,
			IdempotencyKey: fmt.Sprintf("LEDGER-DELIVERED-%s", order.ID),
			Reason:         "Revenue recognition and courier payout accrual on delivery",
			Metadata:       map[string]any{"courier_id": order.CourierID},
			CreatedBy:      scannedBy,
			ActorRole:      "courier",
		}
		// FB-088: catat batch_id di metadata untuk rekonsiliasi earnings
		// (order batch food: payout tetap per-order saat tiap delivery —
		// pickup di-share 1 trip, tanpa double-count).
		if order.BatchID != nil {
			journal.Metadata["batch_id"] = *order.BatchID
		}

		entries := []domain.LedgerEntry{
			// Revenue Recognition (Realized)
			{AccountName: "unearned_revenue", DebitIDR: grossTariff, CreditIDR: 0},
			{AccountName: "delivery_revenue", DebitIDR: 0, CreditIDR: grossTariff},

			// Courier Payable Accrual
			{AccountName: "courier_payout_expense", DebitIDR: courierPayable, CreditIDR: 0},
			{AccountName: "courier_payable", DebitIDR: 0, CreditIDR: courierPayable},
		}

		// If promo applied (we assume TotalPriceIDR < grossTariff indicates promo)
		promoDiscount := grossTariff - order.TotalPriceIDR
		if promoDiscount > 0 {
			entries = append(entries, domain.LedgerEntry{AccountName: "promo_subsidy_expense", DebitIDR: promoDiscount, CreditIDR: 0})
			entries = append(entries, domain.LedgerEntry{AccountName: "unearned_revenue", DebitIDR: 0, CreditIDR: promoDiscount})
		}

		if err = s.ledgerRepo.CreateJournalWithEntries(ctx, journal, entries); err != nil {
			return fmt.Errorf("failed to write ledger for delivery: %w", err)
		}
	}

	// FOOD-BIKE-067: Merchant settlement escrow untuk order food on-demand
	// (merchant_id terisi, tanpa payment link). Non-fatal: jika settlement
	// gagal dibuat, scan delivered tetap sukses — settlement bisa diproses
	// manual/reconcile. Idempotent via "settle-order-<orderID>".
	if targetStatus == domain.StatusDelivered && order.MerchantID != nil && s.settlementSvc != nil {
		if err := s.settlementSvc.HandleFoodOrderDelivered(ctx, order.ID); err != nil {
			log.Printf("[settlement] FOOD-BIKE-067 failed untuk order %s: %v", order.ID, err)
		}
	}

	// FOOD-BIKE-068: Tambah poin "tutup poin" saat order delivered dengan
	// courier terassign. Non-fatal — kegagalan hanya dilog.
	if targetStatus == domain.StatusDelivered && order.CourierID != nil && s.pointsSvc != nil {
		courierUserID, errUser := uuid.Parse(*order.CourierID)
		orderUUID, errOrder := uuid.Parse(order.ID)
		if errUser == nil && errOrder == nil {
			if err := s.pointsSvc.AddPoints(ctx, courierUserID, orderUUID); err != nil {
				log.Printf("[points] FOOD-BIKE-068 failed untuk order %s: %v", order.ID, err)
			}
		}
	}

	// FB-124: Push progress ke customer + merchant pada transisi food.
	// pickup (accepted → picked_up): customer tahu pesanan diambil driver,
	// merchant dapat konfirmasi serah terima. delivered: keduanya di-notif.
	// Fire-and-forget — gagal kirim hanya di-log, tidak menggagalkan scan.
	if order.MerchantID != nil && s.pushSvc != nil {
		if targetStatus == domain.StatusPickedUp {
			if errPush := s.pushSvc.NotifyCustomerPickedUp(ctx, order.ID, "Pesananmu sudah diambil driver dan sedang dalam perjalanan"); errPush != nil {
				log.Printf("[OrderService] FB-124 push picked_up customer gagal order %s: %v", order.ID, errPush)
			}
			if errPush := s.pushSvc.NotifyMerchantPickedUp(ctx, order.ID, "Pesanan sudah diambil driver — terima kasih!"); errPush != nil {
				log.Printf("[OrderService] FB-124 push picked_up merchant gagal order %s: %v", order.ID, errPush)
			}
		}
		if targetStatus == domain.StatusDelivered {
			if errPush := s.pushSvc.NotifyCustomerDelivered(ctx, order.ID, "Pesananmu sudah diantar — selamat menikmati!"); errPush != nil {
				log.Printf("[OrderService] FB-124 push delivered customer gagal order %s: %v", order.ID, errPush)
			}
			if errPush := s.pushSvc.NotifyMerchantDelivered(ctx, order.ID, "Pesanan sudah diantar ke customer"); errPush != nil {
				log.Printf("[OrderService] FB-124 push delivered merchant gagal order %s: %v", order.ID, errPush)
			}
		}
	}

	// 4. Save order event
	eventMsg := fmt.Sprintf("Package scan recorded: %s", scan.ScanType)
	if scan.ScanType == "delivered" {
		eventMsg = "Package delivered successfully. ePOD recorded."
	}
	if scan.ScanType == "failed_delivery" {
		eventMsg = "Delivery attempt failed. Recipient unavailable or refused package."
	}
	if scan.ScanType == "return_to_sender" {
		eventMsg = "Package is being returned to sender."
	}
	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    targetStatus,
		Message:   eventMsg,
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	// 4. Notify customer
	title := "Package Scan Event"
	msg := fmt.Sprintf("Your package is currently in state: %s", scan.ScanType)
	switch scan.ScanType {
	case "pickup":
		title = "Package Picked Up!"
		msg = "Your courier has picked up the package."
	case "inbound_origin":
		title = "Arrived at Origin Hub"
		msg = "Your package has arrived at the origin sorting center."
	case "outbound_origin":
		title = "Departed Origin Hub"
		msg = "Your package is on its way to the destination city."
	case "inbound_destination":
		title = "Arrived at Destination Hub"
		msg = "Your package has arrived at the destination city sorting center."
	case "outbound_destination":
		title = "Sorting Complete"
		msg = "Your package is ready to be dispatched for local delivery."
	case "out_for_delivery":
		title = "Out for Delivery!"
		msg = "The courier is on their way to deliver your package today."
	case "delivered":
		title = "Delivered Successfully!"
		msg = "Your package has been delivered. Thank you for using TEMBUS!"
	case "failed_delivery":
		title = "Delivery Attempt Failed"
		msg = "Courier was unable to complete delivery. Our team will contact you for next steps."
	case "return_to_sender":
		title = "Package Returning to Sender"
		msg = "Your package is being returned to the pickup location. Contact support if you need assistance."
	}

	_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
		UserID:  order.CustomerID,
		Title:   title,
		Message: msg,
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"order_id":  order.ID,
			"scan_type": scan.ScanType,
			"type":      "package_scan",
		},
	})

	return nil
}

func (s *orderServiceImpl) GetPackageScans(ctx context.Context, orderID string) ([]*domain.PackageScan, error) {
	return s.orderRepo.GetScansForOrder(ctx, orderID)
}

func (s *orderServiceImpl) CreateConsolidationBag(ctx context.Context, createdBy string, bag *domain.ConsolidationBag) error {
	if bag.BagNumber == "" {
		return errors.New("bag number is required")
	}
	bag.Status = "sealed"
	bag.CreatedBy = createdBy
	return s.orderRepo.CreateConsolidationBag(ctx, bag)
}

func (s *orderServiceImpl) OpenConsolidationBag(ctx context.Context, unbaggedBy string, bagNumber string) error {
	bag, err := s.orderRepo.GetConsolidationBag(ctx, bagNumber)
	if err != nil {
		return err
	}
	if bag == nil {
		return fmt.Errorf("consolidation bag %s not found", bagNumber)
	}
	if bag.Status == "opened" {
		return nil // Already unbagged
	}
	return s.orderRepo.UpdateConsolidationBagStatus(ctx, bagNumber, "opened")
}

func (s *orderServiceImpl) GetConsolidationBag(ctx context.Context, bagNumber string) (*domain.ConsolidationBag, []*domain.PackageScan, error) {
	bag, err := s.orderRepo.GetConsolidationBag(ctx, bagNumber)
	if err != nil {
		return nil, nil, err
	}
	if bag == nil {
		return nil, nil, fmt.Errorf("consolidation bag %s not found", bagNumber)
	}
	scans, err := s.orderRepo.GetScansByBagNumber(ctx, bagNumber)
	if err != nil {
		return nil, nil, err
	}
	return bag, scans, nil
}

func (s *orderServiceImpl) AutoDetectScanType(ctx context.Context, orderID string, warehouseID string) (string, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return "", err
	}
	if order == nil {
		return "", fmt.Errorf("order %s not found", orderID)
	}

	switch order.Status {
	case domain.StatusPickedUp:
		return "inbound_origin", nil
	case domain.StatusInboundOrigin:
		return "outbound_origin", nil
	case domain.StatusOutboundOrigin:
		return "inbound_destination", nil
	case domain.StatusInboundDestination:
		return "outbound_destination", nil
	case domain.StatusOutboundDestination:
		return "out_for_delivery", nil
	case domain.StatusDelivering:
		return "delivered", nil
	default:
		return string(order.Status), nil
	}
}

func (s *orderServiceImpl) StartMatching(ctx context.Context, orderID string) error {
	log.Printf("[OrderService] Triggering automated matching for order: %s", orderID)

	// 1. Get current order state
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", orderID)
	}

	// 2. Validate state (should be pending_payment or similar after confirmation)
	// Some enterprise flows might skip 'pending_payment' if it's already confirmed via webhook

	// 3. Update status to 'searching'
	if err := s.orderRepo.UpdateStatus(ctx, orderID, domain.StatusSearching); err != nil {
		return fmt.Errorf("failed to update status to searching: %w", err)
	}

	// 4. Record event
	event := domain.OrderEvent{
		OrderID:   orderID,
		UserID:    order.CustomerID,
		Status:    domain.StatusSearching,
		Message:   "Payment confirmed. Searching for nearest courier...",
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	// 5. Trigger finding logic asynchronously to not block the internal API caller
	go func() {
		// Use a background context for the async job
		bgCtx := context.Background()
		if err := s.FindAndAssignCourier(bgCtx, orderID); err != nil {
			log.Printf("[OrderService] Async matching failed for %s: %v", orderID, err)
		}
	}()

	return nil
}

func (s *orderServiceImpl) RetryMatching(ctx context.Context, orderID string) error {
	log.Printf("[OrderService] Retrying automated matching for order: %s", orderID)

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return fmt.Errorf("order %s not found", orderID)
	}

	if order.Status != domain.StatusNoCourierFound && order.Status != domain.StatusSearching {
		return fmt.Errorf("order cannot be retried from status: %s", order.Status)
	}

	return s.StartMatching(ctx, orderID)
}

// SubmitRating memproses penilaian customer terhadap kurir.
// Security: customerID diambil dari JWT (middleware), bukan dari body request.
// Validasi:
//  1. Order harus dimiliki oleh customerID yang sedang login.
//  2. Status order harus "delivered".
//  3. Order belum pernah di-rating (courier_rating IS NULL).
//  4. Rating antara 1.0 - 5.0.
func (s *orderServiceImpl) SubmitRating(ctx context.Context, customerID string, orderID string, req domain.SubmitRatingRequest) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return domain.ErrNotFound
	}

	// Security: pastikan order milik customer yang sedang login
	if order.CustomerID != customerID {
		return domain.ErrForbidden
	}

	// Validasi status: hanya order yang sudah delivered yang bisa di-rating
	if order.Status != domain.StatusDelivered {
		return fmt.Errorf("rating hanya bisa diberikan untuk order yang sudah terkirim (status: %s)", order.Status)
	}

	// Idempotency: cegah double rating
	if order.CourierRating != nil {
		return domain.ErrConflict
	}

	// Validasi range rating
	if req.Rating < 1.0 || req.Rating > 5.0 {
		return fmt.Errorf("rating harus antara 1 sampai 5 bintang")
	}

	courierID := ""
	if order.CourierID != nil {
		courierID = *order.CourierID
	}
	if courierID == "" {
		return fmt.Errorf("order tidak memiliki data kurir")
	}

	// Simpan rating ke DB, update avg_rating kurir secara atomik
	return s.orderRepo.SaveOrderRating(ctx, orderID, courierID, req.Rating, req.Comment)
}

// SubmitMerchantRating — FOOD-BIKE-059/060: customer menilai makanan merchant,
// terpisah dari rating driver. Validasi sama (order milik customer + delivered),
// idempotent via UNIQUE(order_id, merchant_id).
func (s *orderServiceImpl) SubmitMerchantRating(ctx context.Context, customerID string, orderID string, req domain.SubmitRatingRequest) error {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return domain.ErrNotFound
	}

	// Security: pastikan order milik customer yang sedang login
	if order.CustomerID != customerID {
		return domain.ErrForbidden
	}

	// Validasi status: hanya order delivered yang bisa di-rating
	if order.Status != domain.StatusDelivered {
		return fmt.Errorf("rating hanya bisa diberikan untuk order yang sudah terkirim (status: %s)", order.Status)
	}

	// Validasi range rating
	if req.Rating < 1.0 || req.Rating > 5.0 {
		return fmt.Errorf("rating harus antara 1 sampai 5 bintang")
	}

	// Order food harus punya merchant
	if order.MerchantID == nil || *order.MerchantID == "" {
		return fmt.Errorf("order tidak memiliki data merchant")
	}

	return s.orderRepo.SaveMerchantRating(ctx, orderID, *order.MerchantID, customerID, req.Rating, req.Comment)
}

// GetOrdersNeedingRatingReminder mengembalikan order yang perlu mendapat notifikasi
// reminder rating. Dipanggil saat customer membuka notifikasi atau oleh worker.
// Constraint: max 4 reminder, interval minimal 12 jam.
func (s *orderServiceImpl) GetOrdersNeedingRatingReminder(ctx context.Context, customerID string) ([]*domain.Order, error) {
	const maxReminder = 4
	const reminderIntervalHours = 12
	return s.orderRepo.GetDeliveredUnratedOrders(ctx, customerID, maxReminder, reminderIntervalHours)
}

func (s *orderServiceImpl) GetCourierPerformanceStats(ctx context.Context, courierID string) (*domain.CourierPerformanceStats, error) {
	uuidID, err := uuid.Parse(courierID)
	if err != nil {
		return nil, err
	}
	return s.relayRepo.GetCourierPerformanceStats(ctx, uuidID)
}

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — CreateFoodOrder (FOOD-BIKE-073)
// Zero-trust: harga item dihitung ulang server-side dari
// merchant_menu_items. Client hanya kirim menu_item_id + quantity.
// ─────────────────────────────────────────────────────────────
func (s *orderServiceImpl) CreateFoodOrder(ctx context.Context, userID string, req domain.CreateFoodOrderRequest) (*domain.Order, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}

	// 1. Validasi merchant: ada, approved, buka
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
	// FB-107: merchant sedang pause sementara — tolak order baru sampai
	// paused_until lewat (auto un-pause, tidak butuh aksi merchant).
	if merchant.PausedUntil != nil && merchant.PausedUntil.After(time.Now()) {
		return nil, domain.NewUserFacingError(fmt.Sprintf("merchant sedang pause — coba lagi setelah %s",
			merchant.PausedUntil.Format("15:04")))
	}
	// FB-094: merchant wajib punya lokasi (pin di peta saat daftar).
	// Tanpa lokasi, ongkir & "resto terdekat" tidak bisa dihitung dengan benar.
	if merchant.Lat == 0 && merchant.Lng == 0 {
		return nil, fmt.Errorf("merchant belum melengkapi lokasi toko — lengkapi pin lokasi di profil merchant dulu")
	}

	// 1b. FB-123: validasi pesanan terjadwal (kalau IsScheduled).
	// Aturan: wajib isi waktu, min lead 30 menit, same-day only, dalam jam
	// operasional merchant. Status tetap pending_payment — transisi ke
	// 'scheduled' terjadi di payment callback (payment_service.go).
	var scheduledAt *time.Time
	if req.IsScheduled {
		if errV := validateScheduledAt(req.ScheduledAt, merchant.JamBuka, merchant.JamTutup, time.Now()); errV != nil {
			// UAT-C-033/034/035: pesan validasi jadwal tampil ke customer.
			return nil, domain.NewUserFacingError(errV.Error())
		}
		scheduledAt = req.ScheduledAt
	}

	// 2. Ambil menu items by ID — harga dari server, bukan client
	menuIDs := make([]string, 0, len(req.Items))
	for _, it := range req.Items {
		menuIDs = append(menuIDs, it.MenuID)
	}
	menuItems, err := s.foodRepo.GetFoodMenuItems(ctx, menuIDs)
	if err != nil {
		return nil, err
	}
	menuByID := make(map[string]domain.FoodMenuItemInfo, len(menuItems))
	for _, mi := range menuItems {
		menuByID[mi.ID] = mi
	}

	// 3. Validasi: semua item ketemu, available, milik merchant ini
	for _, it := range req.Items {
		mi, ok := menuByID[it.MenuID]
		if !ok {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak ditemukan: %s", it.MenuID))
		}
		if mi.MerchantID != req.MerchantID {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item bukan milik merchant ini: %s", it.MenuID))
		}
		if !mi.IsAvailable {
			return nil, domain.NewUserFacingError(fmt.Sprintf("menu item tidak tersedia: %s", mi.Name))
		}
	}

	// 3b. FB-108: ambil grup varian semua menu item (map[menuID][]variant).
	variantMap, err := s.foodRepo.GetMenuItemVariants(ctx, menuIDs)
	if err != nil {
		return nil, fmt.Errorf("get menu variants: %w", err)
	}

	// 4. Hitung ulang harga (server-side) + snapshot item
	var subtotal int64
	maxPrep := 0
	orderItems := make([]domain.FoodOrderItem, 0, len(req.Items))
	for _, it := range req.Items {
		mi := menuByID[it.MenuID]
		variants, hasVariants := variantMap[it.MenuID]

		// FB-108: validasi pilihan varian — zero-trust, semua dicek server.
		var itemDelta int64
		itemVariants := make([]domain.FoodOrderItemVariant, 0, len(it.Variants))
		if hasVariants && len(it.Variants) > 0 {
			selectedByVariant := make(map[string][]string) // variantID -> optionIDs
			optionByID := make(map[string]domain.MenuItemVariantOption)
			for _, v := range variants {
				for _, o := range v.Options {
					optionByID[o.ID] = o
				}
			}
			for _, sel := range it.Variants {
				// variant harus milik menu item ini
				var varFound *domain.MenuItemVariant
				for i := range variants {
					if variants[i].ID == sel.VariantID {
						varFound = &variants[i]
						break
					}
				}
				if varFound == nil {
					return nil, domain.NewUserFacingError(fmt.Sprintf("variant %s bukan milik menu item %s", sel.VariantID, mi.Name))
				}
				// option harus milik variant itu
				opt, okOpt := optionByID[sel.OptionID]
				if !okOpt || opt.VariantID != sel.VariantID {
					return nil, domain.NewUserFacingError(fmt.Sprintf("option %s bukan milik variant %s", sel.OptionID, sel.VariantID))
				}
				selectedByVariant[sel.VariantID] = append(selectedByVariant[sel.VariantID], sel.OptionID)
				itemDelta += opt.PriceDelta
				itemVariants = append(itemVariants, domain.FoodOrderItemVariant{
					VariantID:   varFound.ID,
					OptionID:    opt.ID,
					VariantName: varFound.Nama,
					OptionName:  opt.Nama,
					PriceDelta:  opt.PriceDelta,
				})
			}
			// validasi aturan per grup: required + max_select
			for _, v := range variants {
				selCount := len(selectedByVariant[v.ID])
				if v.IsRequired && selCount == 0 {
					return nil, domain.NewUserFacingError(fmt.Sprintf("pilih %s dulu untuk %s", v.Nama, mi.Name))
				}
				if selCount > v.MaxSelect {
					return nil, domain.NewUserFacingError(fmt.Sprintf("maksimal %d pilihan untuk %s (%s)", v.MaxSelect, v.Nama, mi.Name))
				}
				if selCount > 0 && selCount < v.MinSelect {
					return nil, domain.NewUserFacingError(fmt.Sprintf("minimal %d pilihan untuk %s (%s)", v.MinSelect, v.Nama, mi.Name))
				}
			}
		} else if hasVariants {
			// Item punya varian tapi client tidak kirim satupun — tolak kalau
			// ada grup required. Grup optional tanpa pilihan = skip (boleh).
			for _, v := range variants {
				if v.IsRequired {
					return nil, domain.NewUserFacingError(fmt.Sprintf("pilih %s dulu untuk %s", v.Nama, mi.Name))
				}
			}
		}

		unitPrice := mi.Price + itemDelta
		sub := unitPrice * int64(it.Quantity)
		subtotal += sub
		if mi.PrepTimeMinutes > maxPrep {
			maxPrep = mi.PrepTimeMinutes
		}
		orderItems = append(orderItems, domain.FoodOrderItem{
			MenuItemID: mi.ID,
			ItemName:   mi.Name,
			ItemPrice:  unitPrice,
			Quantity:   it.Quantity,
			Notes:      it.Notes,
			Subtotal:   sub,
			Variants:   itemVariants,
		})
	}

	// FB-109: minimum subtotal order merchant (0 = tanpa minimum).
	// Validasi SEBELUM bayar — customer langsung dapat pesan jelas.
	if merchant.MinOrderIDR > 0 && subtotal < merchant.MinOrderIDR {
		return nil, fmt.Errorf("minimum order di toko ini Rp %d — subtotal kamu Rp %d",
			merchant.MinOrderIDR, subtotal)
	}

	// 5. Ongkir: jarak merchant → dropoff, tarif dari service product food_delivery
	distanceKM := haversineKM(merchant.Lat, merchant.Lng, req.DropoffLat, req.DropoffLng)

	// FB-104: tolak order yang jaraknya melebihi radius maksimum kurir
	// (20 km = batas atas dropdown radius kurir sepeda). Tanpa ini order
	// tetap dibuat, masuk searching, lalu timeout tanpa peringatan awal —
	// customer sudah bayar duluan baru tahu tidak ada kurir.
	if err := validateFoodDeliveryDistance(distanceKM); err != nil {
		// UAT-C-032: pesan radius tampil ke customer sebelum bayar.
		return nil, domain.NewUserFacingError(err.Error())
	}

	svc, err := s.pricingRepo.GetDeliveryServiceByCode(ctx, "food_delivery")
	if err != nil || svc == nil {
		return nil, fmt.Errorf("service product food_delivery tidak ditemukan: %w", err)
	}
	deliveryFee := svc.BaseFareIDR
	if distanceKM > svc.IncludedDistanceKM {
		extra := int64(math.Ceil(distanceKM - svc.IncludedDistanceKM))
		deliveryFee += extra * svc.PerKmIDR
	}

	// 6. Biaya layanan (platform fee) — default 10% kalau config 0
	platformFeePct := svc.PlatformFeePct
	if platformFeePct <= 0 {
		platformFeePct = 10
	}
	platformFee := int64(math.Round(float64(subtotal) * platformFeePct / 100))

	total := subtotal + deliveryFee + platformFee

	// 6b. FB-078: apply voucher diskon (kalau ada) — zero-trust server-side.
	// Base diskon = subtotal + deliveryFee (platform fee tidak boleh kena diskon).
	// Validate dulu (tanpa catat usage); usage dicatat SETELAH order tersimpan.
	orderID := uuid.New().String()
	var voucherDiscount int64
	var voucherUsage *domain.VoucherValidationResult
	if req.VoucherCode != "" && s.voucherSvc != nil {
		vres, verr := s.voucherSvc.Validate(ctx, req.VoucherCode, userID, subtotal+deliveryFee, "p2p")
		if verr != nil {
			return nil, fmt.Errorf("voucher: %w", verr)
		}
		if !vres.Valid {
			return nil, fmt.Errorf("voucher tidak valid: %s", vres.Error)
		}
		voucherDiscount = vres.DiscountIDR
		if voucherDiscount > total {
			voucherDiscount = total
		}
		total -= voucherDiscount
		voucherUsage = vres
	}

	// 7. Build Order (status awal pending_payment, service_sub_type food_delivery)
	orderNum := fmt.Sprintf("TMBS%s", strings.ToUpper(uuid.New().String()[:6]))
	handoverToken := uuid.New().String()
	qrURL, err := utils.GenerateQRCodeDataURI(handoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate qr code: %w", err)
	}

	prepMin := maxPrep
	merchantID := merchant.ID
	serviceSubType := "food_delivery"
	now := time.Now()
	order := &domain.Order{
		ID:                 orderID,
		OrderNumber:        orderNum,
		CustomerID:         userID,
		Model:              "p2p", // CHECK constraint orders_model_check — hanya p2p/two_legs/three_legs/hub_and_spoke; food = p2p + service_sub_type food_delivery
		Status:             domain.StatusPendingPayment,
		PickupAddress:      merchant.Address,
		PickupLat:          merchant.Lat,
		PickupLng:          merchant.Lng,
		DropoffAddress:     req.DropoffAddress,
		DropoffCity:        req.DropoffCity,
		DropoffZipCode:     req.DropoffZipCode,
		DropoffLat:         req.DropoffLat,
		DropoffLng:         req.DropoffLng,
		ItemDescription:    "Pesanan makanan",
		DistanceKM:         distanceKM,
		IncludedDistanceKM: svc.IncludedDistanceKM,
		DistanceFeeIDR:     deliveryFee,
		BasePriceIDR:       subtotal,
		DynamicPriceIDR:    subtotal,
		TotalPriceIDR:      total,
		DiscountIDR:        voucherDiscount,
		PromoCode:          req.VoucherCode,
		PricingSnapshot:    "{}", // kolom json NOT NULL — food tidak punya snap struct; kirim objek kosong
		TaxRuleCode:        "PPN_11", // FK tax_rules.code — food kena PPN standar 11%
		PlatformFeeIDR:     platformFee,
		PlatformFeePct:     platformFeePct,
		HandoverToken:      handoverToken,
		QRCodeURL:          qrURL,
		ReceiverName:       req.ReceiverName,
		ReceiverPhone:      req.ReceiverPhone,
		ServiceSubType:     serviceSubType,
		Contactless:        req.Contactless,
		OrderNotes:         req.OrderNotes, // FB-121: catatan level order
		MerchantID:         &merchantID,
		PrepTimeMinutes:    &prepMin,
		ScheduledAt:        scheduledAt,   // FB-123: NULL = pesan langsung
		IsScheduled:        scheduledAt != nil,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	// 8. Simpan order + items dalam SATU transaksi
	if err := s.foodRepo.CreateFoodOrderWithItems(ctx, order, orderItems); err != nil {
		return nil, err
	}

	// 8.b Catat pemakaian voucher SETELAH order sukses — kalau order gagal,
	// voucher tidak hangus (single-use tetap valid utk retry).
	if voucherUsage != nil {
		if oid, errO := uuid.Parse(order.ID); errO == nil {
			if uid, errU := uuid.Parse(order.CustomerID); errU == nil {
				_ = s.voucherSvc.RecordUsage(ctx, voucherUsage.VoucherID, oid, uid, voucherUsage.DiscountIDR)
			}
		}
	}

	// 9. Event + broadcast (pola CreateOrder)
	event := domain.OrderEvent{
		OrderID:   order.ID,
		UserID:    order.CustomerID,
		Status:    order.Status,
		Message:   "Food order created, awaiting payment",
		CreatedAt: now,
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)

	if s.notificationSvc != nil {
		_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
			UserID:  userID,
			Title:   "Order dibuat",
			Message: fmt.Sprintf("Order %s menunggu pembayaran", orderNum),
		})
	}

	return order, nil
}

// validateFoodDeliveryDistance — FB-104: tolak order food kalau jarak
// merchant → dropoff melebihi radius maksimum kurir (20 km = batas atas
// dropdown radius kurir sepeda). Dipanggil di CreateFoodOrder SEBELUM
// customer bayar, supaya tidak ada order yang masuk searching lalu
// timeout tanpa kurir bersedia.
func validateFoodDeliveryDistance(distanceKM float64) error {
	const foodMaxRadiusKM = 20.0
	if distanceKM > foodMaxRadiusKM {
		return fmt.Errorf("jarak pengantaran %.1f km melebihi radius maksimum kurir (%.0f km) — pilih merchant yang lebih dekat atau alamat antar yang lain", distanceKM, foodMaxRadiusKM)
	}
	return nil
}

// validateItemCategory — TC-LOG-005: cegah order dengan kategori/deskripsi
// barang terlarang (gas, chemical, weapon, flammable, explosive, dll).
// Case-insensitive. Cek baik field `category` eksplisit maupun kata kunci
// berbahaya di `item_description` (defense-in-depth).
func validateItemCategory(category, description string) error {
	forbidden := []string{
		"gas", "gas lpg", "elpiji", "chemical", "kimia", "weapon", "senjata",
		"gun", "pistol", "flammable", "mudah terbakar", "explosive", "peledak",
		"bahan peledak", "radioactive", "radioaktif", "toxic", "beracun", "drugs", "narkoba",
	}
	hay := strings.ToLower(strings.TrimSpace(category)) + " " + strings.ToLower(strings.TrimSpace(description))
	for _, f := range forbidden {
		if strings.Contains(hay, f) {
			return domain.ErrForbiddenItem
		}
	}
	return nil
}

// jakartaLoc — AUDIT-FIX M1: semua perbandingan jam operasional & same-day
// memakai zona WIB (Asia/Jakarta) eksplisit, TIDAK bergantung TZ OS server
// (container Docker default UTC → geser 7 jam). Merchant beroperasi di
// Indonesia; jadwal customer dikirim dengan offset lokal dan dikonversi ke
// WIB untuk dibandingkan dengan jam_buka/jam_tutup merchant.
var jakartaLoc = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("WIB", 7*60*60) // fallback aman kalau tzdata hilang
	}
	return loc
}()

// inJakarta — konversi time ke zona WIB (AUDIT-FIX M1).
func inJakarta(t time.Time) time.Time {
	return t.In(jakartaLoc)
}

// validateScheduledAt — FB-123: aturan pesanan terjadwal yang dipakai
// CreateFoodOrder: wajib ada waktu, min lead 30 menit, same-day only,
// dalam jam operasional merchant (jam_buka/jam_tutup TIME "HH:MM[:SS]").
// AUDIT-FIX M1: perbandingan jam/tanggal memakai zona WIB eksplisit;
// AUDIT-FIX M3: dukung jam operasional lintas tengah malam (buka 18:00–02:00).
// Pure function (terima `now` eksplisit) — testable & tidak time-dependent.
func validateScheduledAt(sa *time.Time, jamBuka, jamTutup *string, now time.Time) error {
	if sa == nil {
		return fmt.Errorf("waktu jadwal wajib diisi (scheduled_at)")
	}
	if sa.Before(now.Add(30 * time.Minute)) {
		return fmt.Errorf("waktu jadwal minimal 30 menit dari sekarang")
	}
	// Same-day only (V1): tanggal harus sama dengan hari ini (zona WIB).
	saJkt := inJakarta(*sa)
	nowJkt := inJakarta(now)
	y1, m1, d1 := saJkt.Date()
	y2, m2, d2 := nowJkt.Date()
	if y1 != y2 || m1 != m2 || d1 != d2 {
		return fmt.Errorf("pesanan terjadwal hanya bisa untuk hari ini — pilih jam yang masih hari ini")
	}
	// Jam operasional merchant (jam_buka/jam_tutup TIME "HH:MM[:SS]").
	// Jam merchant diasumsikan zona WIB (operasi di Indonesia).
	if jamBuka != nil && jamTutup != nil {
		openH, openM, errO := parseHHMM(*jamBuka)
		closeH, closeM, errC := parseHHMM(*jamTutup)
		if errO == nil && errC == nil {
			targetMin := saJkt.Hour()*60 + saJkt.Minute()
			openMin := openH*60 + openM
			closeMin := closeH*60 + closeM
			// M3: rentang lintas tengah malam (tutup < buka, mis. 18:00–02:00):
			// valid kalau target >= buka ATAU target <= tutup.
			if closeMin < openMin {
				if targetMin < openMin && targetMin > closeMin {
					return fmt.Errorf("merchant buka jam %s–%s — pilih waktu di dalam jam operasional",
						*jamBuka, *jamTutup)
				}
			} else if targetMin < openMin || targetMin > closeMin {
				return fmt.Errorf("merchant buka jam %s–%s — pilih waktu di dalam jam operasional",
					*jamBuka, *jamTutup)
			}
		}
	}
	return nil
}

// parseHHMM — FB-123: parse jam operasional merchant (TIME "HH:MM" atau
// "HH:MM:SS") → jam + menit. Return error kalau format tidak dikenal.
func parseHHMM(s string) (int, int, error) {
	t, err := time.Parse("15:04:05", s)
	if err != nil {
		t, err = time.Parse("15:04", s)
	}
	if err != nil {
		return 0, 0, err
	}
	return t.Hour(), t.Minute(), nil
}

// haversineKM — jarak dua titik koordinat dalam kilometer.
func haversineKM(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusKM = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLng := (lng2 - lng1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusKM * c
}

// ── FOOD-BIKE-021: accept/reject order food oleh merchant ────────────────────

// AcceptByMerchant — merchant menyetujui order food: pending_merchant → preparing.
// food_ready_at dihitung = NOW() + prep_time_minutes (dipakai worker matching).
func (s *orderServiceImpl) AcceptByMerchant(ctx context.Context, orderID string, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return err
	}
	if o.Status != domain.StatusPendingMerchant {
		return fmt.Errorf("order %s tidak dalam status pending_merchant (status: %s)", orderID, o.Status)
	}
	prep := 15
	if o.PrepTimeMinutes != nil && *o.PrepTimeMinutes > 0 {
		prep = *o.PrepTimeMinutes
	}
	if err := s.foodRepo.AcceptFoodOrder(ctx, orderID, prep); err != nil {
		return err
	}
	s.publishOrderEvent(ctx, orderID, domain.StatusPreparing, "Merchant menerima pesanan — makanan disiapkan")

	// FB-124: notif customer bahwa merchant menerima pesanannya.
	// Wajib masuk inbox juga supaya C-041/UI tracking konsisten.
	// ChannelPush dipakai agar delivery async tetap jalan, tetapi record
	// in-app sudah tersimpan via notification service.
	if s.notificationSvc != nil {
		if errNotif := s.notificationSvc.Send(ctx, domain.NotificationRequest{
			UserID:  o.CustomerID,
			Title:   "Merchant menerima pesananmu",
			Message: "Merchant menerima pesananmu — makanan sedang disiapkan",
			Channel: domain.ChannelPush,
			Data: map[string]string{
				"type":     "merchant_accepted",
				"order_id": orderID,
				"order_no": o.OrderNumber,
			},
		}); errNotif != nil {
			log.Printf("[OrderService] FB-124 notif merchant_accepted gagal order %s: %v", orderID, errNotif)
		}
	}
	return nil
}

// RejectByMerchant — merchant menolak order food: pending_merchant → cancelled.
// Reason wajib (alasan penolakan merchant). FB-081: setelah reject sukses →
// trigger refund 100% otomatis. FB-082: fee di-charge ke merchant (piutang).
func (s *orderServiceImpl) RejectByMerchant(ctx context.Context, orderID string, merchantID string, reason string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	o, err := s.foodRepo.GetFoodOrderForMerchant(ctx, orderID, merchantID)
	if err != nil {
		return err
	}
	if o.Status != domain.StatusPendingMerchant {
		return fmt.Errorf("order %s tidak dalam status pending_merchant (status: %s)", orderID, o.Status)
	}
	if err := s.foodRepo.RejectFoodOrder(ctx, orderID, reason); err != nil {
		return err
	}
	s.publishOrderEvent(ctx, orderID, domain.StatusCancelled, "Pesanan ditolak merchant: "+reason)

	// FB-081: merchant menolak = kesalahan merchant → refund penuh
	// FB-082: fee di-charge ke merchant (customer refund 100%, platform tidak rugi)
	s.triggerRefundOnCancel(ctx, orderID, "Pesanan ditolak merchant: "+reason, domain.StatusPendingMerchant, "merchant")
	return nil
}

// triggerRefundOnCancel — helper: trigger refund dgn original status eksplisit
// (fire-and-forget — error hanya di-log, tidak menggagalkan flow utama).
// chargeFeeTo: "customer" (default) | "merchant" (FB-082) | "none".
func (s *orderServiceImpl) triggerRefundOnCancel(ctx context.Context, orderID string, reason string, originalStatus domain.OrderStatus, chargeFeeTo string) {
	if s.refundSvc == nil {
		return
	}
	oid, errParse := uuid.Parse(orderID)
	if errParse != nil {
		log.Printf("[OrderService] triggerRefundOnCancel: invalid order id %s", orderID)
		return
	}
	if _, errRefund := s.refundSvc.CalculateAndTriggerRefund(ctx, oid, reason, domain.RefundOptions{OriginalStatus: originalStatus, ChargeCancellationFeeTo: chargeFeeTo}); errRefund != nil {
		log.Printf("[OrderService] triggerRefundOnCancel: gagal refund order %s: %v", orderID, errRefund)
	}
	// FB-083: refund tip juga (kalau ada) — fire-and-forget
	if s.tipSvc != nil {
		if errTip := s.tipSvc.RefundTipByOrder(ctx, oid); errTip != nil {
			log.Printf("[OrderService] triggerRefundOnCancel: gagal refund tip order %s: %v", orderID, errTip)
		}
	}
	// FB-084: notif push customer — order batal karena kesalahan merchant
	// (reject / timeout respon). Fire-and-forget.
	if s.pushSvc != nil {
		if errPush := s.pushSvc.NotifyCustomerOrderCancelled(ctx, orderID, reason); errPush != nil {
			log.Printf("[OrderService] triggerRefundOnCancel: gagal push notif customer order %s: %v", orderID, errPush)
		}
	}
}

// ProcessFoodPrepTransitions — dipanggil food_prep_worker tiap 1 menit:
//  1. Order preparing yang food_ready_at ≤ NOW()+5m → searching (driver matching
//     mulai 5 menit sebelum makanan siap, driver standby saat ready).
//  2. Order pending_merchant yang belum direspon > 3 menit → auto-cancel
//     (FOOD-BIKE-022, pola SLA worker).
func (s *orderServiceImpl) ProcessFoodPrepTransitions(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	// 1) preparing → searching
	prepping, err := s.foodRepo.GetPreparingFoodOrders(ctx)
	if err != nil {
		return fmt.Errorf("get preparing food orders: %w", err)
	}
	for _, o := range prepping {
		if err := s.orderRepo.UpdateStatus(ctx, o.ID, domain.StatusSearching); err != nil {
			log.Printf("[FoodPrepWorker] gagal transisi %s → searching: %v", o.ID, err)
			continue
		}
		s.publishOrderEvent(ctx, o.ID, domain.StatusSearching, "Makanan hampir siap — mencari driver terdekat")
	}

	// 2) pending_merchant timeout → auto-cancel
	timeouts, err := s.foodRepo.GetPendingMerchantFoodOrders(ctx, 3*time.Minute)
	if err != nil {
		return fmt.Errorf("get pending merchant timeouts: %w", err)
	}
	for _, o := range timeouts {
		if err := s.foodRepo.RejectFoodOrder(ctx, o.ID, "merchant_timeout_3m"); err != nil {
			log.Printf("[FoodPrepWorker] gagal auto-cancel %s: %v", o.ID, err)
			continue
		}
		s.publishOrderEvent(ctx, o.ID, domain.StatusCancelled, "Merchant tidak merespon dalam 3 menit — order dibatalkan otomatis")
		// FB-081: auto-cancel karena merchant tidak merespon → refund 100%
		// (status asal pending_merchant = free window).
		// FB-082: fee di-charge ke merchant (piutang).
		s.triggerRefundOnCancel(ctx, o.ID, "Merchant tidak merespon dalam 3 menit", domain.StatusPendingMerchant, "merchant")
	}

	return nil
}

// ProcessScheduledOrderActivation — dipanggil scheduled_order_worker tiap 1
// menit (FB-123). Order status 'scheduled' yang sudah due (scheduled_at ≤
// NOW() + prep_time + buffer 5 menit):
//
//  1. Re-validasi merchant masih layak terima order:
//     - approved (verification_status)
//     - is_open
//     - tidak sedang paused_until > NOW()
//     - scheduled_at masih dalam jam operasional (jam tutup tidak dimajukan)
//  2. Valid → scheduled → pending_merchant + NotifyMerchantNewOrder (dari
//     titik ini alur sama persis dengan order normal: SLA 3 menit accept).
//  3. Tidak valid → auto-cancel + refund 100% + notif customer (belum ada
//     pihak lain yang mulai kerja → tidak ada fee ke siapapun).
func (s *orderServiceImpl) ProcessScheduledOrderActivation(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	due, err := s.foodRepo.GetScheduledFoodOrdersDue(ctx)
	if err != nil {
		return fmt.Errorf("get scheduled food orders due: %w", err)
	}
	if len(due) == 0 {
		return nil
	}

	now := time.Now()
	for _, so := range due {
		// Re-validasi merchant (bisa berubah sejak order dibuat).
		merchant, errM := s.foodRepo.GetFoodMerchant(ctx, so.MerchantID)
		if errM != nil {
			log.Printf("[ScheduledOrderWorker] gagal load merchant %s untuk order %s: %v", so.MerchantID, so.OrderID, errM)
			// Jangan cancel karena error teknis — biarkan di run berikutnya.
			continue
		}
		valid := merchant != nil &&
			merchant.VerificationStatus == "approved" &&
			merchant.IsOpen &&
			(merchant.PausedUntil == nil || merchant.PausedUntil.Before(now))
		// Jam operasional saat aktivasi (zona WIB — AUDIT-FIX M1).
		// M2: kalau belum jam buka → JANGAN cancel, tunggu tick berikutnya
		// (merchant baru is_open pagi hari; auto-cancel prematur merugikan).
		// M3: dukung rentang lintas tengah malam.
		// m3: aktivasi tepat jam tutup (nowMin == closeMin) dianggap TUTUP.
		nowJkt := inJakarta(now)
		nowMin := nowJkt.Hour()*60 + nowJkt.Minute()
		if valid && merchant.JamBuka != nil && merchant.JamTutup != nil {
			openH, openM, errO := parseHHMM(*merchant.JamBuka)
			closeH, closeM, errC := parseHHMM(*merchant.JamTutup)
			if errO == nil && errC == nil {
				openMin := openH*60 + openM
				closeMin := closeH*60 + closeM
				if closeMin < openMin {
					// Lintas tengah malam: tutup kalau di luar [buka..24:00] ∪ [00:00..tutup]
					if nowMin < openMin && nowMin > closeMin {
						log.Printf("[ScheduledOrderWorker] %s: di luar jam operasional %s–%s (lintas tengah malam) — skip, coba tick berikutnya", so.OrderID, *merchant.JamBuka, *merchant.JamTutup)
						continue
					}
				} else if nowMin < openMin {
					// M2: BELUM jam buka → skip (jangan cancel), tunggu tick berikutnya.
					log.Printf("[ScheduledOrderWorker] %s: belum jam buka (%s) — skip, coba tick berikutnya", so.OrderID, *merchant.JamBuka)
					continue
				} else if nowMin >= closeMin {
					// m3: sudah lewat/tepat jam tutup → cancel.
					valid = false
				}
			}
		}

		if !valid {
			reason := "merchant_tidak_tersedia_saat_aktivasi"
			if errC := s.foodRepo.CancelScheduledFoodOrder(ctx, so.OrderID, reason); errC != nil {
				log.Printf("[ScheduledOrderWorker] gagal auto-cancel scheduled %s: %v", so.OrderID, errC)
				continue
			}
			s.publishOrderEvent(ctx, so.OrderID, domain.StatusCancelled,
				"Maaf, merchant tidak bisa menerima pesanan terjadwal kamu saat ini — dana dikembalikan penuh")
			s.triggerRefundOnCancel(ctx, so.OrderID,
				"Merchant tidak bisa menerima pesanan terjadwal saat aktivasi", domain.StatusScheduled, "platform")
			// m2-AUDIT-FIX: triggerRefundOnCancel sudah mengirim
			// NotifyCustomerOrderCancelled — tidak perlu push kedua (duplikat).
			log.Printf("[ScheduledOrderWorker] auto-cancel scheduled %s (merchant tidak valid)", so.OrderID)
			continue
		}

		// Valid → aktivasi.
		if errA := s.foodRepo.ActivateScheduledFoodOrder(ctx, so.OrderID); errA != nil {
			log.Printf("[ScheduledOrderWorker] gagal aktivasi scheduled %s: %v", so.OrderID, errA)
			continue
		}
		s.publishOrderEvent(ctx, so.OrderID, domain.StatusPendingMerchant,
			"Pesanan terjadwal kamu mulai diproses merchant")
		if s.pushSvc != nil {
			if errN := s.pushSvc.NotifyMerchantNewOrder(ctx, so.OrderID); errN != nil {
				log.Printf("[ScheduledOrderWorker] gagal notify merchant order %s: %v", so.OrderID, errN)
			}
		}
		log.Printf("[ScheduledOrderWorker] aktivasi scheduled %s → pending_merchant", so.OrderID)
	}

	return nil
}

// PairFoodBatches — FB-088: pairing 2 order food `searching` dari merchant
// sama + dropoff berdekatan (≤ 1.5 km) menjadi 1 batch trip courier.
//
// GATE SLA assessment:
//   - Pairing hanya terjadi di window `searching` (matching driver sudah mulai
//     5 menit sebelum makanan siap) → tidak menambah ETA.
//   - Timebox ≤ 2 menit (GetSearchingFoodOrdersForBatch) → kalau tidak ada
//     pasangan, order jalan solo (broadcast normal) — delay bounded.
//   - Radius antar dropoff ≤ 1.5 km → detour maks ~5 menit.
//   - Max 2 order per batch → terukur & aman untuk SLA.
//
// Setelah pairing, courier yang accept order pertama otomatis di-assign ke
// semua order dalam batch (AcceptOrder sudah batch-aware via GetByBatchID).
func (s *orderServiceImpl) PairFoodBatches(ctx context.Context) error {
	if s.foodRepo == nil {
		return nil // food belum di-wire — skip aman
	}

	const (
		maxRadiusKM  = 1.5
		maxETAMin    = 30
	)

	candidates, err := s.foodRepo.GetSearchingFoodOrdersForBatch(ctx)
	if err != nil {
		return fmt.Errorf("get searching food orders for batch: %w", err)
	}

	paired := make(map[string]bool, len(candidates))
	for _, o := range candidates {
		if paired[o.ID] {
			continue
		}
		// Cari pasangan yang juga masih searching & tanpa batch
		cand, distM, err := s.foodRepo.FindBatchCandidate(ctx, o.ID, maxRadiusKM)
		if err != nil {
			log.Printf("[FoodBatchWorker] FindBatchCandidate %s: %v", o.ID, err)
			continue
		}
		if cand == nil {
			continue // tidak ada pasangan — order jalan solo (GATE)
		}

		// Ambil merchant_id order A (pasangan pasti merchant sama — query menjamin)
		orderA, err := s.orderRepo.GetByID(ctx, o.ID)
		if err != nil {
			continue
		}
		batch := &domain.FoodBatch{
			ID:               uuid.New().String(),
			MerchantID:       *orderA.MerchantID,
			DropoffDistanceM: int(distM),
			MaxETAMinutes:    maxETAMin,
		}
		if err := s.foodRepo.CreateFoodBatch(ctx, batch, o.ID, cand.ID); err != nil {
			log.Printf("[FoodBatchWorker] CreateFoodBatch %s+%s: %v", o.ID, cand.ID, err)
			continue
		}

		paired[o.ID] = true
		paired[cand.ID] = true
		log.Printf("[FoodBatchWorker] batch %s terbentuk: %s + %s (jarak dropoff %dm)", batch.ID, o.ID, cand.ID, int(distM))

		// Notify kedua customer — pesanan digabung 1 trip, ETA tetap aman
		for _, oid := range []string{o.ID, cand.ID} {
			s.publishOrderEvent(ctx, oid, domain.StatusSearching,
				"Pesanan digabung dengan pesanan lain di sekitar — driver akan antar keduanya dalam satu perjalanan")
		}
	}

	return nil
}
func (s *orderServiceImpl) publishOrderEvent(ctx context.Context, orderID string, status domain.OrderStatus, message string) {
	event := domain.OrderEvent{
		OrderID:   orderID,
		Status:    status,
		Message:   message,
		CreatedAt: time.Now(),
	}
	_ = s.eventRepo.SaveEvent(ctx, event)
	_ = s.eventBus.Publish(ctx, "order.updates", event)
}

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — Browse merchant (FOOD-BIKE-055/056)
// ─────────────────────────────────────────────────────────────
func (s *orderServiceImpl) ListFoodMerchants(ctx context.Context, lat, lng float64, search, halal string) ([]domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.ListFoodMerchants(ctx, lat, lng, search, halal, 50)
}

func (s *orderServiceImpl) GetFoodMerchantDetail(ctx context.Context, merchantID string) (*domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	menu, err := s.foodRepo.GetFoodMerchantMenu(ctx, merchantID)
	if err != nil {
		return nil, err
	}
	merchant.MenuItems = menu
	return merchant, nil
}

// ─────────────────────────────────────────────────────────────
// FOOD-BIKE-070: Favorite Merchants (C3)
// ─────────────────────────────────────────────────────────────

func (s *orderServiceImpl) AddFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.AddFavoriteMerchant(ctx, customerID, merchantID)
}

func (s *orderServiceImpl) RemoveFavoriteMerchant(ctx context.Context, customerID, merchantID string) error {
	if s.foodRepo == nil {
		return fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.RemoveFavoriteMerchant(ctx, customerID, merchantID)
}

func (s *orderServiceImpl) ListFavoriteMerchants(ctx context.Context, customerID string) ([]domain.FoodMerchantInfo, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.ListFavoriteMerchants(ctx, customerID)
}

func (s *orderServiceImpl) CheckIsFavoriteMerchant(ctx context.Context, customerID, merchantID string) (bool, error) {
	if s.foodRepo == nil {
		return false, fmt.Errorf("food repository not wired")
	}
	return s.foodRepo.CheckIsFavoriteMerchant(ctx, customerID, merchantID)
}

// ─────────────────────────────────────────────────────────────
// FB-084 REORDER — validasi ulang item order food lama
// ─────────────────────────────────────────────────────────────
// CheckReorder membandingkan snapshot food_order_items (harga beku saat
// order) vs harga/availability merchant_menu_items saat ini. Hasilnya
// dipakai client untuk prefill cart + dialog perbedaan harga.
func (s *orderServiceImpl) CheckReorder(ctx context.Context, orderID string) (*domain.ReorderCheckResult, error) {
	if s.foodRepo == nil {
		return nil, fmt.Errorf("food repository not wired")
	}

	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}
	if order.ServiceSubType != "food_delivery" {
		return nil, errors.New("reorder hanya untuk order food delivery")
	}

	// 1. Snapshot item saat order (harga beku).
	snapshotItems, err := s.foodRepo.GetFoodOrderItems(ctx, orderID)
	if err != nil {
		return nil, fmt.Errorf("get food order items: %w", err)
	}

	// 2. Merchant saat ini (is_open + nama) untuk konteks checkout.
	if order.MerchantID == nil || *order.MerchantID == "" {
		return nil, errors.New("order bukan pesanan merchant (tidak bisa reorder)")
	}
	merchant, err := s.foodRepo.GetFoodMerchant(ctx, *order.MerchantID)
	if err != nil {
		return nil, fmt.Errorf("get food merchant: %w", err)
	}

	// 3. Harga & availability menu SAAT INI untuk tiap menu_item_id.
	menuIDs := make([]string, 0, len(snapshotItems))
	for _, it := range snapshotItems {
		menuIDs = append(menuIDs, it.MenuItemID)
	}
	currentMenu := map[string]domain.FoodMenuItemInfo{}
	if len(menuIDs) > 0 {
		list, err := s.foodRepo.GetFoodMenuItems(ctx, menuIDs)
		if err != nil {
			return nil, fmt.Errorf("get current menu items: %w", err)
		}
		for _, m := range list {
			currentMenu[m.ID] = m
		}
	}

	// 4. Bangun hasil per item + total.
	result := &domain.ReorderCheckResult{
		OrderID:      order.ID,
		MerchantID:   *order.MerchantID,
		MerchantName: merchant.Name,
		MerchantOpen: merchant.IsOpen,
		Items:        make([]domain.ReorderCheckItem, 0, len(snapshotItems)),
	}
	for _, it := range snapshotItems {
		cur, found := currentMenu[it.MenuItemID]
		newPrice := it.ItemPrice
		available := found && cur.IsAvailable
		if found {
			newPrice = cur.Price
		}
		item := domain.ReorderCheckItem{
			MenuItemID:   it.MenuItemID,
			ItemName:     it.ItemName,
			Quantity:     it.Quantity,
			Notes:        it.Notes,
			OldPrice:     it.ItemPrice,
			NewPrice:     newPrice,
			Available:    available,
			PriceChanged: !found || cur.Price != it.ItemPrice,
		}
		result.Items = append(result.Items, item)
		result.TotalOld += it.ItemPrice * int64(it.Quantity)
		result.TotalNew += newPrice * int64(it.Quantity)
		if item.PriceChanged || !item.Available {
			result.HasChanges = true
		}
	}

	return result, nil
}
