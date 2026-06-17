package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	StatusPendingPayment    OrderStatus = "pending_payment"
	StatusPending           OrderStatus = "pending"
	StatusPendingAssignment OrderStatus = "pending_assignment"
	StatusSearching         OrderStatus = "searching"
	StatusAccepted          OrderStatus = "accepted"
	StatusPickingUp         OrderStatus = "picking_up"
	StatusPickedUp          OrderStatus = "picked_up"
	StatusInboundOrigin     OrderStatus = "inbound_origin"
	StatusOutboundOrigin    OrderStatus = "outbound_origin"
	StatusInboundDestination OrderStatus = "inbound_destination"
	StatusOutboundDestination OrderStatus = "outbound_destination"
	StatusDelivering        OrderStatus = "delivering"
	StatusDelivered         OrderStatus = "delivered"
	StatusCancelled         OrderStatus = "cancelled"
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
	Length                 float64     `json:"length,omitempty"`
	Width                  float64     `json:"width,omitempty"`
	Height                 float64     `json:"height,omitempty"`
	Weight                 float64     `json:"weight,omitempty"`
	ItemDescription        string      `json:"item_description,omitempty"`
	ItemImageURL           string      `json:"item_image_url,omitempty"`
	DistanceKM             float64     `json:"distance_km"`
	BasePriceIDR           int64       `json:"base_price_idr"`
	VolumetricSurchargeIDR int64       `json:"volumetric_surcharge_idr"`
	DynamicPriceIDR        int64       `json:"dynamic_price_idr"`
	TotalPriceIDR          int64       `json:"total_price_idr"`
	HandoverToken          string      `json:"handover_token"`
	QRCodeURL              string      `json:"qr_code_url,omitempty"`
	CancellationReason     string      `json:"cancellation_reason,omitempty"`
	DispatchExpiry         *time.Time  `json:"dispatch_expiry,omitempty"`
	BatchID                *string     `json:"batch_id,omitempty"`
	SequenceNo             *int        `json:"sequence_no,omitempty"`
	CreatedAt              time.Time   `json:"created_at"`
	UpdatedAt              time.Time   `json:"updated_at"`
}

type CreateOrderRequest struct {
	EstimateID      string `json:"estimate_id" validate:"required"`
	ItemDescription string `json:"item_description" validate:"required,min=5"`
	ItemImageURL    string `json:"item_image_url,omitempty"`
}

type OrderService interface {
	CreateOrder(ctx context.Context, userID string, req CreateOrderRequest) (*Order, error)
	GetOrder(ctx context.Context, orderID string) (*Order, error)
	ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, orderID string, status OrderStatus) error
	UpdateDimensions(ctx context.Context, orderID string, length, width, height, weight *float64) error
	AcceptOrder(ctx context.Context, orderID string, courierID string) error
	FindAndAssignCourier(ctx context.Context, orderID string) error
	ListEvents(ctx context.Context, userID string, since time.Time) ([]OrderEvent, error)
	ScanPackage(ctx context.Context, scannedBy string, scan *PackageScan) error
	GetPackageScans(ctx context.Context, orderID string) ([]*PackageScan, error)
	CreateConsolidationBag(ctx context.Context, createdBy string, bag *ConsolidationBag) error
	OpenConsolidationBag(ctx context.Context, unbaggedBy string, bagNumber string) error
	StartMatching(ctx context.Context, orderID string) error
	GetConsolidationBag(ctx context.Context, bagNumber string) (*ConsolidationBag, []*PackageScan, error)
	AutoDetectScanType(ctx context.Context, orderID string, warehouseID string) (string, error)
}

type OrderRepository interface {
	Create(ctx context.Context, order *Order) error
	GetByID(ctx context.Context, id string) (*Order, error)
	GetByOrderNumber(ctx context.Context, orderNumber string) (*Order, error)
	GetByBatchID(ctx context.Context, batchID string) ([]*Order, error)
	ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, id string, status OrderStatus) error
	UpdateDimensions(ctx context.Context, id string, length, width, height, weight float64) error
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
	SaveScan(ctx context.Context, scan *PackageScan) error
	GetScansForOrder(ctx context.Context, orderID string) ([]*PackageScan, error)
	CreateConsolidationBag(ctx context.Context, bag *ConsolidationBag) error
	GetConsolidationBag(ctx context.Context, bagNumber string) (*ConsolidationBag, error)
	UpdateConsolidationBagStatus(ctx context.Context, bagNumber string, status string) error
	GetLatestScanForOrder(ctx context.Context, orderID string) (*PackageScan, error)
	GetScansByBagNumber(ctx context.Context, bagNumber string) ([]*PackageScan, error)
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

type PackageScan struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"order_id"`
	ScanType    string    `json:"scan_type"`
	ScannedBy   string    `json:"scanned_by"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	WarehouseID *string   `json:"warehouse_id,omitempty"`
	PhotoURL    *string   `json:"photo_url,omitempty"`
	BagNumber   *string   `json:"bag_number,omitempty"`
	RecordedAt  time.Time `json:"recorded_at"`
}

type ConsolidationBag struct {
	ID                     string    `json:"id"`
	BagNumber              string    `json:"bag_number"`
	VehiclePlate           *string   `json:"vehicle_plate,omitempty"`
	FlightNumber           *string   `json:"flight_number,omitempty"`
	OriginWarehouseID      *string   `json:"origin_warehouse_id,omitempty"`
	DestinationWarehouseID *string   `json:"destination_warehouse_id,omitempty"`
	Status                 string    `json:"status"` // 'sealed', 'opened'
	CreatedBy              string    `json:"created_by"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}


