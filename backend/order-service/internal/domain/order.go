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
	QRCodeURL              string      `json:"qr_code_url,omitempty"`
	CancellationReason     string      `json:"cancellation_reason,omitempty"`
	DispatchExpiry         *time.Time  `json:"dispatch_expiry,omitempty"`
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
	FindAndAssignCourier(ctx context.Context, orderID string) error
	ListEvents(ctx context.Context, userID string, since time.Time) ([]OrderEvent, error)
}

type OrderRepository interface {
	Create(ctx context.Context, order *Order) error
	GetByID(ctx context.Context, id string) (*Order, error)
	ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, id string, status OrderStatus) error
	CancelExpiredOrders(ctx context.Context, timeout time.Duration) (int64, error)
	AssignCourier(ctx context.Context, orderID string, courierID string) error
	GetActiveCourierOrder(ctx context.Context, courierID string) (string, error)
	GetPendingAssignmentOrders(ctx context.Context, threshold time.Duration) ([]*Order, error)
	SetDispatchExpiry(ctx context.Context, orderID string, expiry time.Time) error
	ListMeetingPoints(ctx context.Context, lat, lng float64, radiusKM float64) ([]MeetingPoint, error)
	CreateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	UpdateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	DeleteMeetingPoint(ctx context.Context, id string) error
	GetMeetingPointAnalytics(ctx context.Context) ([]MeetingPointAnalytics, error)
}

type MeetingPoint struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	Category     string  `json:"category"` // hub, fuel_station, convenience_store
	Address      string  `json:"address"`
	IsActive     bool    `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type MeetingPointAnalytics struct {
	MeetingPointID string  `json:"meeting_point_id"`
	Name           string  `json:"name"`
	UsageCount     int     `json:"usage_count"`
	AvgWaitTimeMin float64 `json:"avg_wait_time_min"`
}

type OrderEventRepository interface {
	SaveEvent(ctx context.Context, event OrderEvent) error
	ListEventsByUserID(ctx context.Context, userID string, since time.Time) ([]OrderEvent, error)
	ListEventsByOrderID(ctx context.Context, orderID string) ([]OrderEvent, error)
}

type OrderEvent struct {
	ID        string      `json:"id"`
	OrderID   string      `json:"order_id"`
	UserID    string      `json:"user_id"`
	Status    OrderStatus `json:"status"`
	Message   string      `json:"message,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
}

type MeetingPointService interface {
	SuggestMeetingPoint(ctx context.Context, pickupLat, pickupLng, dropoffLat, dropoffLng float64) ([]map[string]interface{}, error)
	CreateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	UpdateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	DeleteMeetingPoint(ctx context.Context, id string) error
	GetAnalytics(ctx context.Context) ([]MeetingPointAnalytics, error)
}
