package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	StatusPendingPayment      OrderStatus = "pending_payment"
	StatusPending             OrderStatus = "pending"
	StatusPendingAssignment   OrderStatus = "pending_assignment"
	StatusReadyForPickup      OrderStatus = "ready_for_pickup"
	StatusSearching           OrderStatus = "searching"
	StatusAccepted            OrderStatus = "accepted"
	StatusPickingUp           OrderStatus = "picking_up"
	StatusPickedUp            OrderStatus = "picked_up"
	StatusInboundOrigin       OrderStatus = "inbound_origin"
	StatusOutboundOrigin      OrderStatus = "outbound_origin"
	StatusInboundDestination  OrderStatus = "inbound_destination"
	StatusOutboundDestination OrderStatus = "outbound_destination"
	StatusDelivering          OrderStatus = "delivering"
	StatusDelivered           OrderStatus = "delivered"
	StatusFailedDelivery      OrderStatus = "failed_delivery"
	StatusReturnToSender      OrderStatus = "return_to_sender"
	StatusCancelled           OrderStatus = "cancelled"
	StatusNoCourierFound      OrderStatus = "no_courier_found"
)

type Order struct {
	ID                     string       `json:"id"`
	OrderNumber            string       `json:"order_number"`
	CustomerID             string       `json:"customer_id"`
	Model                  string       `json:"model"`
	Status                 OrderStatus  `json:"status"`
	PickupAddress          string       `json:"pickup_address"`
	PickupCity             string       `json:"pickup_city,omitempty"`
	PickupZipCode          string       `json:"pickup_zip_code,omitempty"`
	PickupLat              float64      `json:"pickup_lat"`
	PickupLng              float64      `json:"pickup_lng"`
	DropoffAddress         string       `json:"dropoff_address"`
	DropoffCity            string       `json:"dropoff_city,omitempty"`
	DropoffZipCode         string       `json:"dropoff_zip_code,omitempty"`
	DropoffLat             float64      `json:"dropoff_lat"`
	DropoffLng             float64      `json:"dropoff_lng"`
	Length                 float64      `json:"length,omitempty"`
	Width                  float64      `json:"width,omitempty"`
	Height                 float64      `json:"height,omitempty"`
	Weight                 float64      `json:"weight,omitempty"`
	ItemDescription        string       `json:"item_description,omitempty"`
	ItemImageURL           string       `json:"item_image_url,omitempty"`
	DistanceKM             float64      `json:"distance_km"`
	IncludedDistanceKM     float64      `json:"included_distance_km"`
	DistanceFeeIDR         int64        `json:"distance_fee_idr"`
	BasePriceIDR           int64        `json:"base_price_idr"`
	VolumetricWeightKG     float64      `json:"volumetric_weight_kg"`
	VolumetricSurchargeIDR int64        `json:"volumetric_surcharge_idr"`
	DynamicPriceIDR        int64        `json:"dynamic_price_idr"`
	SurgeFeeIDR            int64        `json:"surge_fee_idr"`
	DiscountIDR            int64        `json:"discount_idr"`
	PromoCode              string       `json:"promo_code,omitempty"`
	PromoSponsor           string       `json:"promo_sponsor,omitempty"`
	SurgeMultiplier        float64      `json:"surge_multiplier"`
	WeatherMultiplier      float64      `json:"weather_multiplier"`
	TrafficMultiplier      float64      `json:"traffic_multiplier"`
	PricingSnapshot        string       `json:"pricing_snapshot,omitempty"`
	TotalPriceIDR          int64        `json:"total_price_idr"`
	TaxRuleCode            string       `json:"tax_rule_code,omitempty"`
	PPNRateEffectivePct    float64      `json:"ppn_rate_effective_pct,omitempty"`
	PPNRateStatutoryPct    float64      `json:"ppn_rate_statutory_pct,omitempty"`
	DPPIDR                 int64        `json:"dpp_idr,omitempty"`
	PPNIDR                 int64        `json:"ppn_idr,omitempty"`
	TaxInvoiceRequired     bool         `json:"tax_invoice_required,omitempty"`
	TaxInvoiceStatus       string       `json:"tax_invoice_status,omitempty"`
	PlatformFeeIDR         int64        `json:"platform_fee_idr"`
	PlatformFeePct         float64      `json:"platform_fee_pct"`
	PromoSubsidyIDR        int64        `json:"promo_subsidy_idr"`
	HandoverToken          string       `json:"handover_token"`
	QRCodeURL              string       `json:"qr_code_url,omitempty"`
	CancellationReason     string       `json:"cancellation_reason,omitempty"`
	DispatchExpiry         *time.Time   `json:"dispatch_expiry,omitempty"`
	BatchID                *string      `json:"batch_id,omitempty"`
	SequenceNo             *int         `json:"sequence_no,omitempty"`
	CourierID              *string      `json:"courier_id,omitempty"`              // Added for S2-OS-01
	LogisticsProvider      string       `json:"logistics_provider,omitempty"`
	LogisticsServiceType   string       `json:"logistics_service_type,omitempty"`
	LogisticsTariffIDR     int64        `json:"logistics_tariff_idr,omitempty"`
	LogisticsNetCostIDR    int64        `json:"logistics_net_cost_idr,omitempty"`
	AWB                    string       `json:"awb_number,omitempty"`
	TrackingURL            string       `json:"tracking_url,omitempty"`
	ReceiverName           string       `json:"receiver_name,omitempty"`
	ReceiverPhone          string       `json:"receiver_phone,omitempty"`
	RoutingCode            string       `json:"routing_code,omitempty"`
	Courier                *CourierInfo `json:"courier,omitempty"`                 // Added for Courier Profile
	CourierRating          *float64     `json:"courier_rating,omitempty"`          // Rating 1-5 diberikan customer setelah delivered
	RatingComment          *string      `json:"rating_comment,omitempty"`          // Komentar opsional
	RatingReminderCount    int          `json:"rating_reminder_count,omitempty"`   // Sudah berapa kali diingatkan
	LastRatingReminderAt   *time.Time   `json:"last_rating_reminder_at,omitempty"` // Kapan terakhir diingatkan
	CreatedAt              time.Time    `json:"created_at"`
	UpdatedAt              time.Time    `json:"updated_at"`
}

type CourierInfo struct {
	ID               string  `json:"id"`
	FullName         string  `json:"full_name"`
	ProfilePhotoURL  string  `json:"profile_photo_url"`
	Initial          string  `json:"initial"`
	VehicleType      string  `json:"vehicle_type"`
	VehiclePlate     string  `json:"vehicle_plate"`
	AvgPartnerRating float64 `json:"avg_partner_rating"`
}

type CreateOrderRequest struct {
	EstimateID             string  `json:"estimate_id" validate:"required"` // For on-demand, or tariff ID for 3PL
	ItemDescription        string  `json:"item_description" validate:"required,min=5"`
	ItemImageURL           string  `json:"item_image_url,omitempty"`
	IsScheduled            bool    `json:"is_scheduled"`
	// Logistics fields (optional if using on-demand)
	LogisticsProvider      string  `json:"logistics_provider,omitempty"`
	LogisticsServiceType   string  `json:"logistics_service_type,omitempty"`
	LogisticsTariffIDR     int64   `json:"logistics_tariff_idr,omitempty"`
	LogisticsNetCostIDR    int64   `json:"logistics_net_cost_idr,omitempty"`
	PickupAddress          string  `json:"pickup_address,omitempty"`
	PickupCity             string  `json:"pickup_city,omitempty"`
	PickupZipCode          string  `json:"pickup_zip_code,omitempty"`
	PickupLat              float64 `json:"pickup_lat,omitempty"`
	PickupLng              float64 `json:"pickup_lng,omitempty"`
	DropoffAddress         string  `json:"dropoff_address,omitempty"`
	DropoffCity            string  `json:"dropoff_city,omitempty"`
	DropoffZipCode         string  `json:"dropoff_zip_code,omitempty"`
	DropoffLat             float64 `json:"dropoff_lat,omitempty"`
	DropoffLng             float64 `json:"dropoff_lng,omitempty"`
	Length                 float64 `json:"length,omitempty"`
	Width                  float64 `json:"width,omitempty"`
	Height                 float64 `json:"height,omitempty"`
	Weight                 float64 `json:"weight,omitempty"`
	ReceiverName           string  `json:"receiver_name,omitempty"`
	ReceiverPhone          string  `json:"receiver_phone,omitempty"`
}

// SubmitRatingRequest adalah request body dari customer untuk memberi rating ke kurir.
// Rating bersifat opsional (1-5 bintang), kurir tidak bisa rating dirinya sendiri.
// Backend wajib memvalidasi: OrderStatus == 'delivered' && CourierRating == nil.
type SubmitRatingRequest struct {
	Rating  float64 `json:"rating" validate:"required,min=1,max=5"`
	Comment string  `json:"comment,omitempty"`
}

type BulkOrderDestination struct {
	EstimateID      string `json:"estimate_id" validate:"required"`
	ItemDescription string `json:"item_description" validate:"required,min=5"`
	ItemImageURL    string `json:"item_image_url,omitempty"`
}

type CreateBulkOrderRequest struct {
	Destinations []BulkOrderDestination `json:"destinations" validate:"required,min=2,max=5"`
	IsScheduled  bool                   `json:"is_scheduled"`
}

type OrderService interface {
	CreateOrder(ctx context.Context, userID string, req CreateOrderRequest) (*Order, error)
	CreateInternalAggregatorOrder(ctx context.Context, userID string, req CreateOrderRequest) (*Order, error)
	CreateBulkOrder(ctx context.Context, userID string, req CreateBulkOrderRequest) ([]*Order, string, error)
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
	RetryMatching(ctx context.Context, orderID string) error
	GetConsolidationBag(ctx context.Context, bagNumber string) (*ConsolidationBag, []*PackageScan, error)
	AutoDetectScanType(ctx context.Context, orderID string, warehouseID string) (string, error)
	SetRefundService(rs RefundService)
	// SubmitRating menerima penilaian 1-5 bintang dari customer terhadap kurir.
	// Validasi: order harus berstatus delivered, dan belum pernah di-rating.
	SubmitRating(ctx context.Context, customerID string, orderID string, req SubmitRatingRequest) error
	// GetOrdersNeedingRatingReminder mengambil order delivered milik customer yang
	// belum di-rating, reminder_count < 4, dan sudah 12 jam sejak terakhir diingatkan.
	GetOrdersNeedingRatingReminder(ctx context.Context, customerID string) ([]*Order, error)
	GetCourierPerformanceStats(ctx context.Context, courierID string) (*CourierPerformanceStats, error)
}

type OrderRepository interface {
	Create(ctx context.Context, order *Order) error
	GetByID(ctx context.Context, id string) (*Order, error)
	GetByOrderNumber(ctx context.Context, orderNumber string) (*Order, error)
	GetByAWB(ctx context.Context, awb string) (*Order, error)
	GetByBatchID(ctx context.Context, batchID string) ([]*Order, error)
	ListByUserID(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, id string, status OrderStatus) error
	// UpdateOrderAWB menyimpan nomor AWB dan tracking URL ke order setelah AWB berhasil dibuat.
	UpdateOrderAWB(ctx context.Context, orderID, awbNumber, trackingURL string) error
	UpdateDimensions(ctx context.Context, id string, length, width, height, weight float64) error
	CancelExpiredOrders(ctx context.Context, timeout time.Duration) (int64, error)
	AssignCourier(ctx context.Context, orderID string, courierID string) error
	GetCourierInfo(ctx context.Context, courierID string) (*CourierInfo, error)
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
	// SaveOrderRating menyimpan rating (1-5) dan comment ke tabel orders.
	// Juga menaikkan avg_rating kurir di tabel courier_profiles secara atomik.
	SaveOrderRating(ctx context.Context, orderID string, courierID string, rating float64, comment string) error
	// GetDeliveredUnratedOrders mengambil order dengan status delivered, belum di-rating
	// (courier_rating IS NULL), reminder_count < maxReminder, dan last_rating_reminder_at
	// lebih dari 12 jam yang lalu (atau NULL). Dipakai oleh worker notifikasi.
	GetDeliveredUnratedOrders(ctx context.Context, customerID string, maxReminder int, reminderIntervalHours int) ([]*Order, error)
	// IncrementRatingReminderCount menaikkan reminder_count dan update last_rating_reminder_at.
	IncrementRatingReminderCount(ctx context.Context, orderID string) error

	// Logistics Extensions
	GetLogisticsProviderConfig(ctx context.Context, provider string) (discountPct float64, markupPct float64, err error)
	GetUserSenderName(ctx context.Context, userID string) (string, error)
}

type MeetingPoint struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Category  string    `json:"category"` // hub, fuel_station, convenience_store
	Address   string    `json:"address"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
