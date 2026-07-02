package service

import (
	"context"
	"fmt"
	"strings"
	"tembus/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

type paymentLinkServiceImpl struct {
	repo            domain.PaymentLinkRepository
	pricingSvc      domain.PricingService
	orderSvc        domain.OrderService
	gateway         domain.PaymentGateway
	notificationSvc domain.NotificationService
}

func NewPaymentLinkService(repo domain.PaymentLinkRepository, pricingSvc domain.PricingService, orderSvc domain.OrderService, gateway domain.PaymentGateway, notificationSvc domain.NotificationService) domain.PaymentLinkService {
	return &paymentLinkServiceImpl{
		repo:            repo,
		pricingSvc:      pricingSvc,
		orderSvc:        orderSvc,
		gateway:         gateway,
		notificationSvc: notificationSvc,
	}
}

func (s *paymentLinkServiceImpl) CreateLink(ctx context.Context, merchantID string, req domain.CreatePaymentLinkRequest) (*domain.PaymentLink, error) {
	// 1. Calculate merchant fee
	merchantFee := s.pricingSvc.CalculateMerchantFee(ctx, req.ItemPrice)

	// 2. Generate Delivery Estimate
	estimateReq := &domain.PricingEstimateRequest{
		PickupLat:  req.PickupLat,
		PickupLng:  req.PickupLng,
		DropoffLat: req.DropoffLat,
		DropoffLng: req.DropoffLng,
		// Assuming default weight/dims for UMKM items (e.g. 1kg)
		Weight: 1.0,
		Length: 10.0,
		Width:  10.0,
		Height: 10.0,
		Models: []string{req.ServiceCode},
	}
	estimateResp, err := s.pricingSvc.EstimatePrice(ctx, estimateReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate delivery estimate: %w", err)
	}

	estimateID := estimateResp.EstimateID
	deliveryFee := estimateResp.TotalPriceIDR

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
		StoreName:         req.StoreName,
		Status:            domain.PaymentLinkStatusPending,
		ExpiredAt:         time.Now().Add(10 * time.Minute), // 10 minutes expiry
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}

	if err := s.repo.Create(ctx, link); err != nil {
		return nil, fmt.Errorf("failed to create payment link: %w", err)
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

	// 3. Auto-Create Order
	// Note: The EstimateID might be slightly expired (> 10 mins). In a real production app,
	// we might need to recreate the estimate or bypass the Redis check in OrderService.
	// We'll pass it to CreateOrder.
	orderReq := domain.CreateOrderRequest{
		EstimateID:      link.EstimateID,
		ItemDescription: link.ItemName,
		ItemImageURL:    link.ItemImageURL,
	}

	order, err := s.orderSvc.CreateOrder(ctx, link.MerchantID, orderReq)
	if err != nil {
		// If estimate expired, we log it and maybe alert admin, but the payment is already captured.
		// A robust system would create a "draft" order without estimate or recreate it.
		// For MVP, we just return the error.
		return fmt.Errorf("failed to auto-create order after payment: %w", err)
	}

	// Set the ItemImageURL (from phase 1)
	// OrderService now handles setting the ItemImageURL natively.

	// 4. Update the PaymentLink with the OrderID
	if err := s.repo.UpdateOrderID(ctx, id, order.ID); err != nil {
		// Just log the error, the order is already created
		fmt.Printf("Warning: failed to update order_id %s for payment link %s: %v\n", order.ID, id, err)
	}

	return nil
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
