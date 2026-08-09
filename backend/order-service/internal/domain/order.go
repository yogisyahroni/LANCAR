package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	StatusPendingPayment OrderStatus = "pending_payment"
	// FOOD-BIKE-020: status food delivery — disisipkan antara pending_payment dan searching.
	StatusPendingMerchant     OrderStatus = "pending_merchant"
	StatusPreparing           OrderStatus = "preparing"
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
	// FB-121: catatan keseluruhan order (ditulis customer saat checkout).
	OrderNotes             string       `json:"order_notes,omitempty"`
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
	CourierID              *string      `json:"courier_id,omitempty"` // Added for S2-OS-01
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
	// Food delivery (FOOD-BIKE-006): service_sub_type + merchant fields
	ServiceSubType     string     `json:"service_sub_type,omitempty" db:"service_sub_type"`
	MerchantID         *string    `json:"merchant_id,omitempty" db:"merchant_id"`
	MerchantName       *string    `json:"merchant_name,omitempty" db:"merchant_name"` // LEFT JOIN merchants (FOOD-BIKE-060)
	MerchantAcceptedAt *time.Time `json:"merchant_accepted_at,omitempty" db:"merchant_accepted_at"`
	PrepTimeMinutes    *int       `json:"prep_time_minutes,omitempty" db:"prep_time_minutes"`
	FoodReadyAt        *time.Time `json:"food_ready_at,omitempty" db:"food_ready_at"`
	// FB-089: contactless delivery — antar tanpa kontak fisik, POD tetap wajib.
	Contactless     bool             `json:"contactless,omitempty" db:"contactless"`
	TambalBanReport *TambalBanReport `json:"tambal_ban_report,omitempty"` // Laporan Tambal Ban
	TowingReport    *TowingReport    `json:"towing_report,omitempty"`     // Laporan Towing
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
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
	EstimateID      string `json:"estimate_id" validate:"required"` // For on-demand, or tariff ID for 3PL
	ItemDescription string `json:"item_description" validate:"required,min=5"`
	ItemImageURL    string `json:"item_image_url,omitempty"`
	IsScheduled     bool   `json:"is_scheduled"`
	// Logistics fields (optional if using on-demand)
	LogisticsProvider    string  `json:"logistics_provider,omitempty"`
	LogisticsServiceType string  `json:"logistics_service_type,omitempty"`
	LogisticsTariffIDR   int64   `json:"logistics_tariff_idr,omitempty"`
	LogisticsNetCostIDR  int64   `json:"logistics_net_cost_idr,omitempty"`
	PickupAddress        string  `json:"pickup_address,omitempty"`
	PickupCity           string  `json:"pickup_city,omitempty"`
	PickupZipCode        string  `json:"pickup_zip_code,omitempty"`
	PickupLat            float64 `json:"pickup_lat,omitempty"`
	PickupLng            float64 `json:"pickup_lng,omitempty"`
	DropoffAddress       string  `json:"dropoff_address,omitempty"`
	DropoffCity          string  `json:"dropoff_city,omitempty"`
	DropoffZipCode       string  `json:"dropoff_zip_code,omitempty"`
	DropoffLat           float64 `json:"dropoff_lat,omitempty"`
	DropoffLng           float64 `json:"dropoff_lng,omitempty"`
	Length               float64 `json:"length,omitempty"`
	Width                float64 `json:"width,omitempty"`
	Height               float64 `json:"height,omitempty"`
	Weight               float64 `json:"weight,omitempty"`
	ReceiverName         string  `json:"receiver_name,omitempty"`
	ReceiverPhone        string  `json:"receiver_phone,omitempty"`
	// FB-078: kode voucher diskon (opsional) — divalidasi server-side.
	VoucherCode string `json:"voucher_code,omitempty"`
}

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — Pemesanan Multi-Item (FOOD-BIKE-072)
// Terpisah dari CreateOrderRequest yang 100% parcel-single.
// Harga item TIDAK dikirim client — dihitung ulang server-side
// dari merchant_menu_items (zero-trust, anti price manipulation).
// ─────────────────────────────────────────────────────────────

type FoodOrderItemRequest struct {
	MenuID   string `json:"menu_item_id" validate:"required"`
	Quantity int    `json:"quantity" validate:"required,min=1,max=99"`
	Notes    string `json:"notes,omitempty"`
}

type CreateFoodOrderRequest struct {
	MerchantID     string                 `json:"merchant_id" validate:"required"`
	Items          []FoodOrderItemRequest `json:"items" validate:"required,min=1,dive"`
	DropoffAddress string                 `json:"dropoff_address" validate:"required"`
	DropoffCity    string                 `json:"dropoff_city,omitempty"`
	DropoffZipCode string                 `json:"dropoff_zip_code,omitempty"`
	DropoffLat     float64                `json:"dropoff_lat" validate:"required"`
	DropoffLng     float64                `json:"dropoff_lng" validate:"required"`
	ReceiverName   string                 `json:"receiver_name,omitempty"`
	ReceiverPhone  string                 `json:"receiver_phone,omitempty"`
	IsScheduled    bool                   `json:"is_scheduled"`

	// FB-121: catatan keseluruhan order (mis. "pisahin sambal semua").
	OrderNotes string `json:"order_notes,omitempty"`

	// FB-089: antar tanpa kontak fisik (foto lokasi dropoff, POD tetap wajib).
	Contactless bool `json:"contactless,omitempty"`

	// FB-078: kode voucher diskon (opsional). Divalidasi + dihitung server-side.
	VoucherCode string `json:"voucher_code,omitempty"`
}

// FoodOrderItem — snapshot item saat order (nama & harga beku di waktu order,
// jangan ambil live dari menu supaya tidak berubah kalau merchant update).
type FoodOrderItem struct {
	ID         string `json:"id"`
	OrderID    string `json:"order_id"`
	MenuItemID string `json:"menu_item_id"`
	ItemName   string `json:"item_name"`
	ItemPrice  int64  `json:"item_price"`
	Quantity   int    `json:"quantity"`
	Notes      string `json:"notes,omitempty"`
	Subtotal   int64  `json:"subtotal"`
}

// FoodMerchantInfo — data merchant yang dibutuhkan order-service untuk
// validasi & pickup location (diambil dari tabel merchants).
type FoodMerchantInfo struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Address            string  `json:"address"`
	IsOpen             bool    `json:"is_open"`
	VerificationStatus string  `json:"verification_status"`
	Lat                float64 `json:"lat"`
	Lng                float64 `json:"lng"`
	JamBuka            *string `json:"jam_buka,omitempty"`
	JamTutup           *string `json:"jam_tutup,omitempty"`
	// FB-107: pause sementara — merchant tidak terima order baru selama
	// PausedUntil > NOW(). NULL = tidak pause.
	PausedUntil *time.Time `json:"paused_until,omitempty"`
	// FB-109: minimum subtotal order (IDR). 0 = tanpa minimum.
	MinOrderIDR int64 `json:"min_order_idr"`
	// FOOD-BIKE-055: metrik browse merchant
	DistanceKM  *float64           `json:"distance_km,omitempty"`
	AvgRating   *float64           `json:"avg_rating,omitempty"`
	RatingCount int                `json:"rating_count"`
	MenuItems   []FoodMenuItemInfo `json:"menu_items,omitempty"`
}

type FoodMenuItemInfo struct {
	ID              string `json:"id"`
	MerchantID      string `json:"merchant_id"`
	Name            string `json:"name"`
	Price           int64  `json:"price"`
	IsAvailable     bool   `json:"is_available"`
	PrepTimeMinutes int    `json:"prep_time_minutes"`
	// FOOD-BIKE-055/056: field UI tambahan
	Kategori *string `json:"kategori,omitempty"`
	Foto     *string `json:"foto,omitempty"`
}

// ── FB-084 REORDER — validasi ulang item order lama sebelum "Pesan Lagi" ──
// ReorderCheckItem: perbandingan snapshot harga saat order vs harga menu
// sekarang + availability. Client pakai ini untuk (a) prefill cart dan
// (b) menampilkan perbedaan harga kalau berubah.
type ReorderCheckItem struct {
	MenuItemID   string `json:"menu_item_id"`
	ItemName     string `json:"item_name"`
	Quantity     int    `json:"quantity"`
	Notes        string `json:"notes,omitempty"`
	OldPrice     int64  `json:"old_price"`
	NewPrice     int64  `json:"new_price"`
	Available    bool   `json:"available"`
	PriceChanged bool   `json:"price_changed"`
}

// ReorderCheckResult — hasil validasi ulang satu order food utk reorder.
// TotalOld = total snapshot saat order; TotalNew = total harga saat ini.
type ReorderCheckResult struct {
	OrderID      string             `json:"order_id"`
	MerchantID   string             `json:"merchant_id"`
	MerchantName string             `json:"merchant_name"`
	MerchantOpen bool               `json:"merchant_open"`
	Items        []ReorderCheckItem `json:"items"`
	TotalOld     int64              `json:"total_old"`
	TotalNew     int64              `json:"total_new"`
	HasChanges   bool               `json:"has_changes"`
}

// FoodRepository — akses merchant/menu/items untuk order-service.
// (merchant-service terpisah; order-service cuma butuh baca + tulis order items)
type FoodRepository interface {
	GetFoodMerchant(ctx context.Context, merchantID string) (*FoodMerchantInfo, error)
	GetFoodMenuItems(ctx context.Context, menuIDs []string) ([]FoodMenuItemInfo, error)
	CreateFoodOrderWithItems(ctx context.Context, order *Order, items []FoodOrderItem) error
	// GetFoodOrderItems — snapshot item food sebuah order (harga beku saat order,
	// dipakai refund partial per item FB-080).
	GetFoodOrderItems(ctx context.Context, orderID string) ([]FoodOrderItem, error)
	// ── FOOD-BIKE-021/022: transisi status food delivery ──
	// GetFoodOrderForMerchant mengambil order food milik merchant tertentu
	// (validasi ownership sebelum accept/reject).
	GetFoodOrderForMerchant(ctx context.Context, orderID, merchantID string) (*Order, error)
	// AcceptFoodOrder: pending_merchant → preparing, set merchant_accepted_at +
	// food_ready_at = NOW() + prep_time_minutes.
	AcceptFoodOrder(ctx context.Context, orderID string, prepMinutes int) error
	// RejectFoodOrder: pending_merchant → cancelled, set cancellation_reason +
	// cancelled_at (dipanggil merchant menolak ATAU timeout auto-cancel worker).
	RejectFoodOrder(ctx context.Context, orderID, reason string) error
	// GetPreparingFoodOrders: order food berstatus preparing yang siap transisi
	// ke searching (matching driver dimulai 5 menit sebelum food_ready_at).
	GetPreparingFoodOrders(ctx context.Context) ([]*Order, error)
	// GetPendingMerchantFoodOrders: order food pending_merchant yang belum direspon
	// merchant melebihi timeout (FOOD-BIKE-022: 3 menit) → auto-cancel.
	GetPendingMerchantFoodOrders(ctx context.Context, timeout time.Duration) ([]*Order, error)
	// FOOD-BIKE-055: browse merchant terdekat (is_open + approved) + menu
	ListFoodMerchants(ctx context.Context, lat, lng float64, search string, limit int) ([]FoodMerchantInfo, error)
	GetFoodMerchantMenu(ctx context.Context, merchantID string) ([]FoodMenuItemInfo, error)
	// ── FB-088: batching driver food ──
	// GetSearchingFoodOrdersForBatch: order food `searching` tanpa batch_id
	// yang siap dipairing (sudah searching ≤ 2 menit, service food_delivery).
	GetSearchingFoodOrdersForBatch(ctx context.Context) ([]*Order, error)
	// FindBatchCandidate: pasangan untuk order tertentu — merchant sama,
	// dropoff ≤ maxRadiusKM, bukan customer yang sama, total max 2 order.
	FindBatchCandidate(ctx context.Context, orderID string, maxRadiusKM float64) (*Order, float64, error)
	// CreateFoodBatch: buat baris food_batches (status forming) + set batch_id
	// kedua order dalam SATU transaksi.
	CreateFoodBatch(ctx context.Context, batch *FoodBatch, orderAID, orderBID string) error
	// GetFoodBatchByOrderID: batch tempat order berada (untuk earnings/audit).
	GetFoodBatchByOrderID(ctx context.Context, orderID string) (*FoodBatch, error)
	// UpdateFoodBatchCourier: status forming/assigned → set courier_id saat
	// courier accept (dipanggil AcceptOrder untuk order batch food).
	UpdateFoodBatchCourier(ctx context.Context, batchID, courierID string) error
}

// FoodBatch — FB-088: dua order food dari merchant sama yang digabung
// jadi satu trip courier (pickup sekali, antar dua titik).
type FoodBatch struct {
	ID                string
	MerchantID        string
	CourierID         *string
	Status            string // forming | assigned | in_progress | completed | cancelled
	OrderAID          string
	OrderBID          *string
	DropoffDistanceM  int
	MaxETAMinutes     int
	CreatedAt         time.Time
	CompletedAt       *time.Time
	UpdatedAt         time.Time
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
	// CreateFoodOrder membuat order food multi-item (FOOD-BIKE-073).
	// Validasi harga 100% server-side dari merchant_menu_items —
	// client hanya kirim menu_item_id + quantity.
	CreateFoodOrder(ctx context.Context, userID string, req CreateFoodOrderRequest) (*Order, error)
	// FOOD-BIKE-055: browse merchant food terdekat + menu.
	ListFoodMerchants(ctx context.Context, lat, lng float64, search string) ([]FoodMerchantInfo, error)
	GetFoodMerchantDetail(ctx context.Context, merchantID string) (*FoodMerchantInfo, error)
	// FB-084 REORDER: validasi ulang item order food lama (harga + availability)
	// sebelum customer klik "Pesan Lagi". Return snapshot vs harga sekarang.
	CheckReorder(ctx context.Context, orderID string) (*ReorderCheckResult, error)
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
	SetServiceReportService(s ServiceReportService)
	// SetFoodRepository inject food repository untuk CreateFoodOrder (FOOD-BIKE-073)
	SetFoodRepository(fr FoodRepository)
	// SetVoucherService inject voucher service untuk apply voucher (FB-078)
	SetVoucherService(vs VoucherService)
	// SetTipService inject tip service untuk refund tip saat order batal (FB-083)
	SetTipService(ts TipService)
	// SetPushService inject push service untuk notif customer saat merchant
	// reject / timeout (FB-084)
	SetPushService(ps PushService)
	// SetMerchantSettlementService inject settlement service untuk order food
	// yang delivered tanpa payment link (FOOD-BIKE-067).
	SetMerchantSettlementService(mss MerchantSettlementService)
	// SetDriverIncentiveServices inject points + penalty service untuk
	// anti-ghosting & tutup poin (FOOD-BIKE-068).
	SetDriverIncentiveServices(pts DriverPointsService, pen DriverPenaltyService)
	// SubmitRating menerima penilaian 1-5 bintang dari customer terhadap kurir.
	// Validasi: order harus berstatus delivered, dan belum pernah di-rating.
	SubmitRating(ctx context.Context, customerID string, orderID string, req SubmitRatingRequest) error
	// SubmitMerchantRating menilai makanan dari merchant (FOOD-BIKE-059/060),
	// terpisah dari rating driver. Validasi sama: order milik customer & delivered.
	SubmitMerchantRating(ctx context.Context, customerID string, orderID string, req SubmitRatingRequest) error
	// ── FOOD-BIKE-021: accept/reject order oleh merchant ──
	// AcceptByMerchant: pending_merchant → preparing (merchant terima).
	// Validasi kepemilikan merchant via foodRepo.GetFoodOrderForMerchant.
	AcceptByMerchant(ctx context.Context, orderID string, merchantID string) error
	// RejectByMerchant: pending_merchant → cancelled dengan reason (merchant tolak).
	RejectByMerchant(ctx context.Context, orderID string, merchantID string, reason string) error
	// ProcessFoodPrepTransitions dipanggil food_prep_worker (FOOD-BIKE-022):
	// 1) preparing yang food_ready_at-5m sudah lewat → searching (mulai matching);
	// 2) pending_merchant yang melewati timeout 3 menit → auto-cancel.
	ProcessFoodPrepTransitions(ctx context.Context) error
	// PairFoodBatches dipanggil food_batch_worker (FB-088): pasangkan 2 order
	// food `searching` dari merchant sama + dropoff berdekatan → 1 trip courier.
	// GATE SLA: timebox ≤ 2 menit; tanpa pasangan → order jalan solo.
	PairFoodBatches(ctx context.Context) error
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
	// SaveMerchantRating menyimpan rating makanan ke merchant_ratings (FOOD-BIKE-059/060).
	SaveMerchantRating(ctx context.Context, orderID string, merchantID string, ratedBy string, rating float64, comment string) error
	// GetDeliveredUnratedOrders mengambil order dengan status delivered, belum di-rating
	// (courier_rating IS NULL), reminder_count < maxReminder, dan last_rating_reminder_at
	// lebih dari 12 jam yang lalu (atau NULL). Dipakai oleh worker notifikasi.
	GetDeliveredUnratedOrders(ctx context.Context, customerID string, maxReminder int, reminderIntervalHours int) ([]*Order, error)
	// IncrementRatingReminderCount menaikkan reminder_count dan update last_rating_reminder_at.
	IncrementRatingReminderCount(ctx context.Context, orderID string) error

	// Logistics Extensions
	GetLogisticsProviderConfig(ctx context.Context, provider string) (discountPct float64, markupPct float64, err error)
	GetUserSenderName(ctx context.Context, userID string) (string, error)

	// FOOD-BIKE-066: Ghost Detection — driver accept tapi tidak bergerak.
	// GetGhostedAcceptedOrders mengembalikan order status 'accepted' yang
	// tidak ada progress (updated_at lama) — kandidat soft_ghosting.
	GetGhostedAcceptedOrders(ctx context.Context, timeout time.Duration) ([]*Order, error)
	// ReleaseGhostedOrder melepas driver dari order: courier_id → NULL,
	// status → searching (order bisa diambil driver lain), dispatch_expiry direset.
	ReleaseGhostedOrder(ctx context.Context, orderID string) error
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
