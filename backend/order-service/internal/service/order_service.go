package service

import (
	"context"
	"errors"
	"fmt"
	"lancar/order-service/internal/domain"
	"lancar/order-service/pkg/utils"
	"time"

	"github.com/google/uuid"
)

type orderServiceImpl struct {
	orderRepo   domain.OrderRepository
	redisRepo   domain.RedisRepository
	pricingRepo domain.PricingRepository
	eventBus    domain.EventBus
}

func NewOrderService(o domain.OrderRepository, r domain.RedisRepository, p domain.PricingRepository, eb domain.EventBus) domain.OrderService {
	return &orderServiceImpl{
		orderRepo:   o,
		redisRepo:   r,
		pricingRepo: p,
		eventBus:    eb,
	}
}

func (s *orderServiceImpl) CreateOrder(ctx context.Context, userID string, req domain.CreateOrderRequest) (*domain.Order, error) {
	// 1. Get cached estimate from Redis
	estimate, err := s.redisRepo.GetEstimate(ctx, req.EstimateID)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired estimate: %w", err)
	}

	// 2. Generate Order Number (RLY-YYYYMMDD-XXXX)
	orderNum := fmt.Sprintf("RLY-%s-%s", time.Now().Format("20060102"), uuid.New().String()[:5])
	handoverToken := uuid.New().String()

	// 3. Generate QR Code Data URI
	qrURL, err := utils.GenerateQRCodeDataURI(handoverToken, 256)
	if err != nil {
		return nil, fmt.Errorf("failed to generate qr code: %w", err)
	}

	// 3. Create Order object
	order := &domain.Order{
		ID:                     uuid.New().String(),
		OrderNumber:            orderNum,
		CustomerID:             userID,
		Model:                  "p2p", // Default to p2p for now
		Status:                 domain.StatusPendingPayment,
		PickupAddress:          estimate.PickupAddress,
		PickupLat:              estimate.PickupLat,
		PickupLng:              estimate.PickupLng,
		DropoffAddress:         estimate.DropoffAddress,
		DropoffLat:             estimate.DropoffLat,
		DropoffLng:             estimate.DropoffLng,
		DistanceKM:             estimate.DistanceKM,
		BasePriceIDR:           estimate.BasePriceIDR,
		VolumetricSurchargeIDR: estimate.VolumetricSurchargeIDR,
		DynamicPriceIDR:        estimate.DynamicPriceIDR,
		TotalPriceIDR:          estimate.TotalPriceIDR,
		HandoverToken:          handoverToken,
		QRCodeURL:              qrURL,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	// 4. Save to DB
	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to save order: %w", err)
	}

	// 5. Publish creation event
	s.eventBus.Publish(ctx, "order.updates", domain.OrderEvent{
		OrderID: order.ID,
		UserID:  order.CustomerID,
		Status:  order.Status,
		Message: "Order created, awaiting payment",
	})

	return order, nil
}

func (s *orderServiceImpl) GetOrder(ctx context.Context, orderID string) (*domain.Order, error) {
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, errors.New("order not found")
	}

	// Generate QR Code URL for the detail view
	qrURL, _ := utils.GenerateQRCodeDataURI(order.HandoverToken, 256)
	order.QRCodeURL = qrURL

	return order, nil
}

func (s *orderServiceImpl) ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	return s.orderRepo.ListByUserID(ctx, userID, filter)
}

func (s *orderServiceImpl) UpdateStatus(ctx context.Context, orderID string, status domain.OrderStatus) error {
	err := s.orderRepo.UpdateStatus(ctx, orderID, status)
	if err != nil {
		return err
	}

	// Fetch order to get UserID for the event
	order, err := s.orderRepo.GetByID(ctx, orderID)
	if err == nil {
		s.eventBus.Publish(ctx, "order.updates", domain.OrderEvent{
			OrderID: order.ID,
			UserID:  order.CustomerID,
			Status:  status,
			Message: fmt.Sprintf("Order status updated to %s", status),
		})
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

	// Cascading search radius: 3km, 5km, 10km
	radii := []float64{3, 5, 10}
	var assignedCourierID string

	for _, radius := range radii {
		couriers, err := s.redisRepo.FindNearbyCouriers(ctx, order.PickupLat, order.PickupLng, radius)
		if err != nil {
			continue
		}

		for _, courierID := range couriers {
			// 1. Check if courier has an active order (Postgres)
			activeOrderID, err := s.orderRepo.GetActiveCourierOrder(ctx, courierID)
			if err != nil || activeOrderID != "" {
				continue // Courier is busy
			}

			// 2. Try to acquire distributed lock for this courier (Redis)
			lockKey := fmt.Sprintf("lock:courier:%s", courierID)
			locked, err := s.redisRepo.AcquireLock(ctx, lockKey, 30*time.Second)
			if err != nil || !locked {
				continue // Another process is trying to assign this courier
			}

			// 3. Assign courier to order (Atomic status update)
			err = s.orderRepo.AssignCourier(ctx, orderID, courierID)
			if err == nil {
				assignedCourierID = courierID
				s.redisRepo.ReleaseLock(ctx, lockKey)
				break
			}
			s.redisRepo.ReleaseLock(ctx, lockKey)
		}

		if assignedCourierID != "" {
			break
		}
		
		// Small delay before next radius
		time.Sleep(500 * time.Millisecond)
	}

	if assignedCourierID == "" {
		return errors.New("no couriers found in 10km radius")
	}

	// 4. Publish assignment event
	s.eventBus.Publish(ctx, "order.updates", domain.OrderEvent{
		OrderID: order.ID,
		UserID:  order.CustomerID,
		Status:  domain.StatusAccepted,
		Message: "Courier found and assigned",
	})

	return nil
}
