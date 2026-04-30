package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	StatusPendingPayment OrderStatus = "pending_payment"
	StatusPending         OrderStatus = "pending"
	StatusSearching       OrderStatus = "searching"
	StatusAccepted        OrderStatus = "accepted"
	StatusPickingUp       OrderStatus = "picking_up"
	StatusPickedUp        OrderStatus = "picked_up"
	StatusDelivering      OrderStatus = "delivering"
	StatusDelivered       OrderStatus = "delivered"
	StatusCancelled       OrderStatus = "cancelled"
)

type Order struct {
	ID                     string      `json:"id"`
	OrderNumber            string      `json:"order_number"`
	CustomerID             string      `json:"customer_id"`
	Model                  string      `json:"model"`
	Status                 OrderStatus `json:"status"`
	PickupAddress          string      `json:"pickup_address"`
	PickupLat              float64     `json:"pickup_lat"`
	PickupLng              float64     `json:"pickup_lng"`
	DropoffAddress         string      `json:"dropoff_address"`
	DropoffLat             float64     `json:"dropoff_lat"`
	DropoffLng             float64     `json:"dropoff_lng"`
	DistanceKM             float64     `json:"distance_km"`
	BasePriceIDR           int64       `json:"base_price_idr"`
	VolumetricSurchargeIDR int64       `json:"volumetric_surcharge_idr"`
	DynamicPriceIDR        int64       `json:"dynamic_price_idr"`
	TotalPriceIDR          int64       `json:"total_price_idr"`
	HandoverToken          string      `json:"handover_token"`
	CreatedAt              time.Time   `json:"created_at"`
	UpdatedAt              time.Time   `json:"updated_at"`
}

type CreateOrderRequest struct {
	EstimateID string `json:"estimate_id" validate:"required"`
}

type OrderService interface {
	CreateOrder(ctx context.Context, userID string, req CreateOrderRequest) (*Order, error)
	GetOrder(ctx context.Context, orderID string) (*Order, error)
	ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, orderID string, status OrderStatus) error
}

type OrderRepository interface {
	Create(ctx context.Context, order *Order) error
	GetByID(ctx context.Context, id string) (*Order, error)
	ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, id string, status OrderStatus) error
}
