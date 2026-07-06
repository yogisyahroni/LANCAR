package service

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)


type paymentLinkServiceImpl struct {
	repo            domain.PaymentLinkRepository
	pricingSvc      domain.PricingService
	orderSvc        domain.OrderService
	orderRepo       domain.OrderRepository
	gateway         domain.PaymentGateway
	notificationSvc domain.NotificationService
	awbClient       domain.AWBClient
	configRepo      domain.ConfigRepository
}

func NewPaymentLinkService(
	repo domain.PaymentLinkRepository,
	pricingSvc domain.PricingService,
	orderSvc domain.OrderService,
	orderRepo domain.OrderRepository,
	gateway domain.PaymentGateway,
	notificationSvc domain.NotificationService,
	awbClient domain.AWBClient,
	configRepo domain.ConfigRepository,
) domain.PaymentLinkService {
	return &paymentLinkServiceImpl{
		repo:            repo,
		pricingSvc:      pricingSvc,
		orderSvc:        orderSvc,
		orderRepo:       orderRepo,
		gateway:         gateway,
		notificationSvc: notificationSvc,
		awbClient:       awbClient,
		configRepo:      configRepo,
	}
}

func (s *paymentLinkServiceImpl) CreateLink(ctx context.Context, merchantID string, req domain.CreatePaymentLinkRequest) (*domain.PaymentLink, error) {
	// 1. Calculate merchant fee
	merchantFee := s.pricingSvc.CalculateMerchantFee(ctx, req.ItemPrice)

	var estimateID string
	var deliveryFee int64

	if req.LogisticsProvider != "" {
		// Use 3PL
		awbOriginCode := s.configRepo.GetStringConfig(ctx, "awb_origin_code", "")
		awbDestCode := s.configRepo.GetStringConfig(ctx, "awb_destination_code", "")
		tariffReq := domain.CheckTariffRequest{
			Provider:        req.LogisticsProvider,
			OriginCode:      awbOriginCode,
			DestinationCode: awbDestCode,
			WeightKG:        1.0,
		}
		
		tariffResp, err := s.awbClient.CheckTariff(ctx, tariffReq)
		if err != nil {
			return nil, fmt.Errorf("failed to check 3PL tariff: %w", err)
		}

		// Calculate tariff user
		var selectedGross int64
		for _, srv := range tariffResp.Services {
			if srv.ServiceCode == req.LogisticsServiceType {
				selectedGross = srv.TariffGross
				break
			}
		}

		if selectedGross == 0 {
			return nil, fmt.Errorf("selected service type %s not available", req.LogisticsServiceType)
		}

		discountPct, markupPct, err := s.orderRepo.GetLogisticsProviderConfig(ctx, req.LogisticsProvider)
		if err != nil {
			discountPct = 0
			markupPct = 0
		}

		tariffNett := float64(selectedGross) * (1.0 - (discountPct / 100.0))
		tariffUser := tariffNett * (1.0 + (markupPct / 100.0))
		
		deliveryFee = int64(tariffUser)
		estimateID = "" // Not using internal pricing EstimateID
	} else {
		// Use internal pricing
		estimateReq := &domain.PricingEstimateRequest{
			PickupLat:  req.PickupLat,
			PickupLng:  req.PickupLng,
			DropoffLat: req.DropoffLat,
			DropoffLng: req.DropoffLng,
			Weight:     1.0,
			Length:     10.0,
			Width:      10.0,
			Height:     10.0,
			Models:     []string{req.ServiceCode},
		}
		estimateResp, err := s.pricingSvc.EstimatePrice(ctx, estimateReq)
		if err != nil {
			return nil, fmt.Errorf("failed to generate delivery estimate: %w", err)
		}
		estimateID = estimateResp.EstimateID
		deliveryFee = estimateResp.TotalPriceIDR
	}

	// Generate a short ID or UUID for the slug
	idStr := strings.ReplaceAll(uuid.New().String(), "-", "")[:12] // 12 char slug

	link := &domain.PaymentLink{
		ID:                idStr,
		MerchantID:        merchantID,
		ItemName:          req.ItemName,
		ItemPrice:         req.ItemPrice,
		ItemImageURL:      req.ItemImageURL,
		MerchantFeeAmount: merchantFee,
		PickupAddress:     req.PickupAddress,
		PickupLat:         req.PickupLat,
		PickupLng:         req.PickupLng,
		DropoffAddress:    req.DropoffAddress,
		DropoffLat:        req.DropoffLat,
		DropoffLng:        req.DropoffLng,
		EstimateID:        estimateID,
		DeliveryFeeAmount: deliveryFee,
		ServiceCode:       req.ServiceCode,
		LogisticsProvider: req.LogisticsProvider,
		LogisticsServiceType: req.LogisticsServiceType,
		StoreName:         req.StoreName,
		RecipientPhone:    req.RecipientPhone,
		RecipientName:     req.RecipientName,
		Status:            domain.PaymentLinkStatusPending,
		ExpiredAt:         time.Now().Add(10 * time.Minute), // 10 minutes expiry
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
		PaymentURL:        s.configRepo.GetStringConfig(ctx, "payment_link_base_url", "https://tembus.id/pay") + "/" + idStr,
	}

	if err := s.repo.Create(ctx, link); err != nil {
		return nil, fmt.Errorf("failed to create payment link: %w", err)
	}

	// Task 2.2: Broadcast WhatsApp ke konsignee (penerima paket) jika nomor HP tersedia.
	// Ini dilakukan setelah link berhasil disimpan (non-blocking; error hanya di-log).
	if req.RecipientPhone != "" && s.awbClient != nil {
		recipientName := req.RecipientName
		if recipientName == "" {
			recipientName = "Anda"
		}
		merchantName := req.StoreName
		if merchantName == "" {
			merchantName = "Merchant"
		}
		paymentURL := link.PaymentURL
		waMsgParts := []string{
			"Halo " + recipientName + "! 👋",
			"",
			"*" + merchantName + "* telah membuat link pembayaran untuk pengiriman paket Anda:",
			"",
			"📦 *Produk:* " + req.ItemName,
			"📍 *Alamat Pengiriman:* " + req.DropoffAddress,
			"",
			"🔗 *Link Pembayaran:*",
			paymentURL,
			"",
			"_Link berlaku 10 menit. Harap segera lakukan pembayaran._",
		}
		waMsg := strings.Join(waMsgParts, "\n")
		if waErr := s.awbClient.SendWhatsApp(ctx, req.RecipientPhone, waMsg); waErr != nil {
			slog.WarnContext(ctx, "payment_link: failed to send WA to consignee",
				"link_id", idStr, "phone", req.RecipientPhone, "error", waErr)
		}
	}

	return link, nil
}

func (s *paymentLinkServiceImpl) GetLink(ctx context.Context, id string) (*domain.PaymentLink, error) {
	link, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if link == nil {
		return nil, fmt.Errorf("payment link not found")
	}

	// Auto-expire check during read if it's pending and past expiry time
	if link.Status == domain.PaymentLinkStatusPending && time.Now().After(link.ExpiredAt) {
		link.Status = domain.PaymentLinkStatusExpired
		// Best-effort update
		_ = s.repo.UpdateStatus(ctx, link.ID, domain.PaymentLinkStatusExpired)
	}

	link.PaymentURL = s.configRepo.GetStringConfig(ctx, "payment_link_base_url", "https://tembus.id/pay") + "/" + link.ID

	return link, nil
}

func (s *paymentLinkServiceImpl) ListLinks(ctx context.Context, merchantID string, limit, offset int) ([]*domain.PaymentLink, error) {
	if limit <= 0 {
		limit = 10
	}
	if offset < 0 {
		offset = 0
	}

	links, err := s.repo.ListByMerchantID(ctx, merchantID, limit, offset)
	if err != nil {
		return nil, err
	}

	// Soft-hide logic: filter out EXPIRED links that are older than 24 hours
	var filtered []*domain.PaymentLink
	now := time.Now()
	for _, link := range links {
		if link.Status == domain.PaymentLinkStatusExpired {
			age := now.Sub(link.ExpiredAt)
			if age > 24*time.Hour {
				continue // skip showing this link
			}
		}
		link.PaymentURL = s.configRepo.GetStringConfig(ctx, "payment_link_base_url", "https://tembus.id/pay") + "/" + link.ID
		filtered = append(filtered, link)
	}

	return filtered, nil
}

func (s *paymentLinkServiceImpl) CheckoutLink(ctx context.Context, id string) (*domain.PaymentLinkCheckoutResponse, error) {
	link, err := s.GetLink(ctx, id)
	if err != nil {
		return nil, err
	}

	if link.Status != domain.PaymentLinkStatusPending {
		return nil, fmt.Errorf("payment link is no longer pending (status: %s)", link.Status)
	}

	totalAmount := link.ItemPrice + link.DeliveryFeeAmount + link.MerchantFeeAmount

	snapReq := domain.SnapRequest{
		OrderID:      fmt.Sprintf("PL-%s", link.ID), // Prefix to avoid collision with normal orders
		AmountIDR:    int(totalAmount),
		ItemName:     link.ItemName,
		CustomerName: "Customer", // Optional generic name
	}

	snapResp, err := s.gateway.GenerateSnap(ctx, snapReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate snap token: %w", err)
	}

	return &domain.PaymentLinkCheckoutResponse{
		Token:       snapResp.Token,
		RedirectURL: snapResp.RedirectURL,
	}, nil
}

func (s *paymentLinkServiceImpl) HandleWebhook(ctx context.Context, id string, event string) error {
	if event != "settlement" && event != "capture" && event != "paid" {
		// Not a success event
		return nil
	}

	// 1. Get the Link
	link, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get payment link: %w", err)
	}
	if link == nil {
		return fmt.Errorf("payment link %s not found", id)
	}

	// Idempotency check
	if link.Status == domain.PaymentLinkStatusPaid {
		return nil // Already handled
	}

	// 2. Update Status to PAID
	if err := s.repo.UpdateStatus(ctx, id, domain.PaymentLinkStatusPaid); err != nil {
		return fmt.Errorf("failed to update payment link status: %w", err)
	}

	// 2.5 Send Notification to Merchant
	_ = s.notificationSvc.Send(ctx, domain.NotificationRequest{
		UserID:  link.MerchantID,
		Title:   "Pembayaran Berhasil!",
		Message: fmt.Sprintf("Payment link untuk %s telah dibayar. Kurir sedang dicari.", link.ItemName),
		Channel: domain.ChannelPush,
		Data: map[string]string{
			"type":    "payment_link_paid",
			"link_id": id,
		},
	})

	// 3. Auto-Create or Update Existing Order
	var order *domain.Order
	if link.OrderID != "" {
		// Existing order from Bulk Upload
		order, err = s.orderRepo.GetByID(ctx, link.OrderID)
		if err != nil {
			return fmt.Errorf("failed to get existing order: %w", err)
		}
		
		// Update status
		newStatus := domain.StatusPendingAssignment
		if err := s.orderRepo.UpdateStatus(ctx, order.ID, newStatus); err != nil {
			return fmt.Errorf("failed to update existing order status: %w", err)
		}
		order.Status = newStatus
	} else {
		// Calculate tariff_net and tariff_user for order creation
		var tariffNet, tariffUser int64
		if link.LogisticsProvider != "" {
			_, markupPct, _ := s.orderRepo.GetLogisticsProviderConfig(ctx, link.LogisticsProvider)
			tariffUser = link.DeliveryFeeAmount
			// Deduce tariffNet based on tariffUser
			tariffNet = int64(float64(tariffUser) / (1.0 + (markupPct / 100.0)))
		}

		orderReq := domain.CreateOrderRequest{
			EstimateID:           link.EstimateID,
			ItemDescription:      link.ItemName,
			ItemImageURL:         link.ItemImageURL,
			LogisticsProvider:    link.LogisticsProvider,
			LogisticsServiceType: link.LogisticsServiceType,
			LogisticsTariffIDR:   tariffUser,
			LogisticsNetCostIDR:  tariffNet,
			PickupAddress:        link.PickupAddress,
			PickupLat:            link.PickupLat,
			PickupLng:            link.PickupLng,
			DropoffAddress:       link.DropoffAddress,
			DropoffLat:           link.DropoffLat,
			DropoffLng:           link.DropoffLng,
			ReceiverName:         link.RecipientName,
			ReceiverPhone:        link.RecipientPhone,
		}

		order, err = s.orderSvc.CreateOrder(ctx, link.MerchantID, orderReq)
		if err != nil {
			return fmt.Errorf("failed to auto-create order after payment: %w", err)
		}

		// 4. Update the PaymentLink with the OrderID
		if err := s.repo.UpdateOrderID(ctx, id, order.ID); err != nil {
			slog.WarnContext(ctx, "payment_link: failed to update order_id",
				"order_id", order.ID, "link_id", id, "error", err)
		}
	}

	// 5. Task 2.5: Generate AWB via integration-gateway (hanya jika awbClient tersedia)
	// Konfigurasi AWB diambil dari system_configs (admin-configurable, tidak hardcoded).
	if s.awbClient != nil && s.orderRepo != nil {
		awbProvider := link.LogisticsProvider
		if awbProvider == "" {
			awbProvider = s.configRepo.GetStringConfig(ctx, "awb_default_provider", "jne")
		}
		awbOriginCode := s.configRepo.GetStringConfig(ctx, "awb_origin_code", "")
		awbDestCode := s.configRepo.GetStringConfig(ctx, "awb_destination_code", "")
		awbServiceType := link.LogisticsServiceType
		if awbServiceType == "" {
			awbServiceType = s.configRepo.GetStringConfig(ctx, "awb_service_type", "REG")
		}
		
		senderName := s.configRepo.GetStringConfig(ctx, "awb_sender_name", "TEMBUS")
		if customSender, err := s.orderRepo.GetUserSenderName(ctx, link.MerchantID); err == nil && customSender != "" {
			senderName = customSender
		}
		senderAlias := senderName

		senderPhone := s.configRepo.GetStringConfig(ctx, "awb_sender_phone", "")
		senderAddress := link.PickupAddress
		if senderAddress == "" {
			senderAddress = s.configRepo.GetStringConfig(ctx, "awb_sender_address", "")
		}

		receiverName := link.RecipientName
		if receiverName == "" {
			receiverName = "Konsignee"
		}
		receiverPhone := link.RecipientPhone
		receiverAddress := link.DropoffAddress

		// AWB hanya di-generate jika origin & dest code dikonfigurasi di system_configs
		if awbOriginCode != "" && awbDestCode != "" {
			awbReq := domain.AWBRequest{
				Provider:        awbProvider,
				ReferenceID:     order.ID,
				SenderAlias:     senderAlias,
				SenderName:      senderName,
				SenderPhone:     senderPhone,
				SenderAddress:   senderAddress,
				ReceiverName:    receiverName,
				ReceiverPhone:   receiverPhone,
				ReceiverAddress: receiverAddress,
				OriginCode:      awbOriginCode,
				DestinationCode: awbDestCode,
				WeightKG:        1.0, // Default untuk paket UMKM
				ItemDescription: link.ItemName,
				ItemValue:       float64(link.ItemPrice),
				ServiceType:     awbServiceType,
			}

			awbResp, awbErr := s.awbClient.CreateAWB(ctx, awbReq)
			if awbErr != nil {
				slog.ErrorContext(ctx, "payment_link: failed to generate AWB",
					"order_id", order.ID, "link_id", id, "error", awbErr)
				// Non-fatal: order tetap diproses, AWB bisa di-retry manual
			} else {
				slog.InfoContext(ctx, "payment_link: AWB generated",
					"order_id", order.ID, "awb_number", awbResp.AWBNumber,
					"provider", awbResp.Provider)

				// Simpan AWB ke tabel orders
				if updateErr := s.orderRepo.UpdateOrderAWB(ctx, order.ID, awbResp.AWBNumber, awbResp.TrackingURL); updateErr != nil {
					slog.ErrorContext(ctx, "payment_link: failed to save AWB to order",
						"order_id", order.ID, "awb_number", awbResp.AWBNumber, "error", updateErr)
				} else {
					// Jika sukses generate AWB, update status menjadi READY_FOR_PICKUP
					if statusErr := s.orderRepo.UpdateStatus(ctx, order.ID, domain.StatusReadyForPickup); statusErr != nil {
						slog.ErrorContext(ctx, "payment_link: failed to update status to ready_for_pickup",
							"order_id", order.ID, "error", statusErr)
					}
				}

				// Task 2.4: Notifikasi WA ke konsignee dengan AWB number
				if receiverPhone != "" {
					trackingMsg := strings.Join([]string{
						"✅ *Pembayaran dikonfirmasi!*",
						"",
						fmt.Sprintf("📦 *Produk:* %s", link.ItemName),
						fmt.Sprintf("🏷️ *Nomor Resi (%s):* %s", strings.ToUpper(awbResp.Provider), awbResp.AWBNumber),
						fmt.Sprintf("🔍 *Lacak Paket:* %s", awbResp.TrackingURL),
						"",
						"_Kurir akan segera menjemput paket dari merchant._",
					}, "\n")
					if waErr := s.awbClient.SendWhatsApp(ctx, receiverPhone, trackingMsg); waErr != nil {
						slog.WarnContext(ctx, "payment_link: failed to send AWB WA to consignee",
							"link_id", id, "phone", receiverPhone, "error", waErr)
					}
				}
			}
		} else {
			slog.WarnContext(ctx, "payment_link: AWB skipped — awb_origin_code or awb_destination_code not configured",
				"order_id", order.ID)
		}
	}

	return nil
}

func (s *paymentLinkServiceImpl) CheckTariff(ctx context.Context, provider, origin, dest string, weight float64) (*domain.CheckTariffResponse, error) {
	if s.awbClient == nil {
		return nil, fmt.Errorf("logistics integration is not available")
	}

	if origin == "" {
		origin = s.configRepo.GetStringConfig(ctx, "awb_origin_code", "")
	}
	if dest == "" {
		dest = s.configRepo.GetStringConfig(ctx, "awb_destination_code", "")
	}

	tariffReq := domain.CheckTariffRequest{
		Provider:        provider,
		OriginCode:      origin,
		DestinationCode: dest,
		WeightKG:        weight,
	}

	resp, err := s.awbClient.CheckTariff(ctx, tariffReq)
	if err != nil {
		return nil, fmt.Errorf("failed to check tariff from provider: %w", err)
	}

	// Apply markup
	discountPct, markupPct, err := s.orderRepo.GetLogisticsProviderConfig(ctx, provider)
	if err == nil {
		for i, srv := range resp.Services {
			tariffNett := float64(srv.TariffGross) * (1.0 - (discountPct / 100.0))
			tariffUser := tariffNett * (1.0 + (markupPct / 100.0))
			resp.Services[i].TariffGross = int64(tariffUser) // Modify gross to show to user
		}
	}

	return resp, nil
}

func (s *paymentLinkServiceImpl) AutoExpireLinks(ctx context.Context) error {
	_, err := s.repo.MarkExpired(ctx, time.Now())
	return err
}

func (s *paymentLinkServiceImpl) CleanupExpiredLinks(ctx context.Context) error {
	// Links that expired more than 24 hours ago
	olderThan := time.Now().Add(-24 * time.Hour)
	_, err := s.repo.SoftDeleteExpiredLinks(ctx, olderThan)
	return err
}
