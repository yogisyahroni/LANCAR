package service

import (
	"context"
	"errors"
	"fmt"
	"lancar/order-service/internal/domain"
	"time"

	"github.com/google/uuid"
)

type orderServiceImpl struct {
	orderRepo   domain.OrderRepository
	redisRepo   domain.RedisRepository
	pricingRepo domain.PricingRepository
}

func NewOrderService(o domain.OrderRepository, r domain.RedisRepository, p domain.PricingRepository) domain.OrderService {
	return &orderServiceImpl{
		orderRepo:   o,
		redisRepo:   r,
		pricingRepo: p,
	}
}

func (s *orderServiceImpl) CreateOrder(ctx context.Context, userID string, req domain.CreateOrderRequest) (*domain.Order, error) {
	// 1. Get cached estimate from Redis
	estimate, err := s.redisRepo.GetEstimate(ctx, req.EstimateID)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired estimate: %w", err)
	}

	// 2. Generate Order Number (LCR-YYYYMMDD-XXXX)
	orderNum := fmt.Sprintf("LCR-%s-%s", time.Now().Format("20060102"), uuid.New().String()[:6])

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
		HandoverToken:          uuid.New().String(),
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	// 4. Save to DB
	if err := s.orderRepo.Create(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to save order: %w", err)
	}

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
	return order, nil
}

func (s *orderServiceImpl) ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*domain.Order, error) {
	return s.orderRepo.ListByUserID(ctx, userID, filter)
}

func (s *orderServiceImpl) UpdateStatus(ctx context.Context, orderID string, status domain.OrderStatus) error {
	return s.orderRepo.UpdateStatus(ctx, orderID, status)
}
