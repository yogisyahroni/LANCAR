package domain

import (
	"context"
	"time"
)

type OrderStatus string

const (
	StatusPendingPayment OrderStatus = "pending_payment"
	// FOOD-BIKE-020: status food delivery — disisipkan antara pending_payment dan searching.
	StatusPendingMerchant OrderStatus = "pending_merchant"
	// FB-123: order food terjadwal — dibayar, tapi "ditahan" dan belum masuk
	// radar merchant. Diaktivasi worker scheduled_order_worker → pending_merchant
	// mendekati scheduled_at. Bisa di-cancel customer (refund 100%).
	StatusScheduled           OrderStatus = "scheduled"
	StatusPreparing           OrderStatus = "preparing"
	StatusPending             OrderStatus = "pending"
	StatusPendingAssignment   OrderStatus = "pending_assignment"
	StatusReadyForPickup      OrderStatus = "ready_for_pickup"
	StatusSearching           OrderStatus = "searching"
	StatusAssigned            OrderStatus = "assigned"
	StatusAccepted            OrderStatus = "accepted"
	StatusPickupArrived       OrderStatus = "pickup_arrived"
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
	ID              string      `json:"id"`
	OrderNumber     string      `json:"order_number"`
	CustomerID      string      `json:"customer_id"`
	Model           string      `json:"model"`
	Status          OrderStatus `json:"status"`
	PickupAddress   string      `json:"pickup_address"`
	PickupCity      string      `json:"pickup_city,omitempty"`
	PickupZipCode   string      `json:"pickup_zip_code,omitempty"`
	PickupLat       float64     `json:"pickup_lat"`
	PickupLng       float64     `json:"pickup_lng"`
	DropoffAddress  string      `json:"dropoff_address"`
	DropoffCity     string      `json:"dropoff_city,omitempty"`
	DropoffZipCode  string      `json:"dropoff_zip_code,omitempty"`
	DropoffLat      float64     `json:"dropoff_lat"`
	DropoffLng      float64     `json:"dropoff_lng"`
	Length          float64     `json:"length,omitempty"`
	Width           float64     `json:"width,omitempty"`
	Height          float64     `json:"height,omitempty"`
	Weight          float64     `json:"weight,omitempty"`
	ItemDescription string      `json:"item_description,omitempty"`
	ItemCategory    string      `json:"item_category,omitempty" db:"-"`
	ItemImageURL    string      `json:"item_image_url,omitempty"`
	// FB-121: catatan keseluruhan order (ditulis customer saat checkout).
	OrderNotes         string  `json:"order_notes,omitempty"`
	DistanceKM         float64 `json:"distance_km"`
	IncludedDistanceKM float64 `json:"included_distance_km"`
	DistanceFeeIDR     int64   `json:"distance_fee_idr"`
	// FB-123: order food terjadwal — scheduled_at kapan order mulai diproses
	// merchant (aktivasi → pending_merchant). NULL = pesan langsung.
	// IsScheduled = turunan dari scheduled_at (computed saat scan).
	ScheduledAt            *time.Time   `json:"scheduled_at,omitempty"`
	IsScheduled            bool         `json:"is_scheduled"`
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
	ServiceSubType     string                   `json:"service_sub_type,omitempty" db:"service_sub_type"`
	ServiceCode        string                   `json:"service_code,omitempty" db:"service_code"`
	ServiceCategory    CanonicalServiceCategory `json:"service_category,omitempty" db:"service_category"`
	ContractVersion    string                   `json:"contract_version" db:"contract_version"`
	QuoteID            string                   `json:"quote_id,omitempty" db:"quote_id"`
	StateVersion       int64                    `json:"state_version" db:"state_version"`
	CorrelationID      string                   `json:"correlation_id,omitempty" db:"correlation_id"`
	PaymentStatus      string                   `json:"payment_status,omitempty" db:"payment_status"`
	ActorOwnership     OrderActorOwnership      `json:"actor_ownership" db:"-"`
	ServiceMetadata    OrderServiceMetadata     `json:"service_metadata" db:"-"`
	MerchantID         *string                  `json:"merchant_id,omitempty" db:"merchant_id"`
	MerchantName       *string                  `json:"merchant_name,omitempty" db:"merchant_name"` // LEFT JOIN merchants (FOOD-BIKE-060)
	MerchantAcceptedAt *time.Time               `json:"merchant_accepted_at,omitempty" db:"merchant_accepted_at"`
	PrepTimeMinutes    *int                     `json:"prep_time_minutes,omitempty" db:"prep_time_minutes"`
	FoodReadyAt        *time.Time               `json:"food_ready_at,omitempty" db:"food_ready_at"`
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
	EstimateID            string `json:"estimate_id" validate:"required"` // For on-demand, or tariff ID for 3PL
	QuoteInputFingerprint string `json:"quote_input_fingerprint,omitempty"`
	QuoteSnapshotHash     string `json:"quote_snapshot_hash,omitempty"`
	ItemDescription       string `json:"item_description" validate:"required,min=5"`
	// Category barang: document, electronic, food, fragile, dll.
	// Nilai terlarang (gas, chemical, weapon, flammable, explosive) dicegah (TC-LOG-005).
	Category     string `json:"category,omitempty"`
	ItemImageURL string `json:"item_image_url,omitempty"`
	IsScheduled  bool   `json:"is_scheduled"`
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

// FoodOrderItemVariantRequest — satu pilihan varian yang dipilih customer.

// FoodOrderItem — snapshot item saat order (nama & harga beku di waktu order,
// jangan ambil live dari menu supaya tidak berubah kalau merchant update).

// FoodOrderItemVariant — snapshot satu pilihan varian di item order.

// FoodMerchantInfo — data merchant yang dibutuhkan order-service untuk
// validasi & pickup location (diambil dari tabel merchants).

// MenuItemVariant — grup varian sebuah menu item (dengan opsi-opsinya).

// MenuItemVariantOption — satu opsi dalam grup varian (harga delta IDR).

// ── FB-084 REORDER — validasi ulang item order lama sebelum "Pesan Lagi" ──
// ReorderCheckItem: perbandingan snapshot harga saat order vs harga menu
// sekarang + availability. Client pakai ini untuk (a) prefill cart dan
// (b) menampilkan perbedaan harga kalau berubah.

// ReorderCheckResult — hasil validasi ulang satu order food utk reorder.
// TotalOld = total snapshot saat order; TotalNew = total harga saat ini.

// FoodRepository — akses merchant/menu/items untuk order-service.
// (merchant-service terpisah; order-service cuma butuh baca + tulis order items)

// ScheduledFoodOrder — FB-123: order terjadwal yang sudah due untuk aktivasi.
// Ringan (bukan full Order) — hanya field yang dibutuhkan worker.

// FoodBatch — FB-088: dua order food dari merchant sama yang digabung
// jadi satu trip courier (pickup sekali, antar dua titik).

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
	ListFoodMerchants(ctx context.Context, lat, lng float64, search, halal string) ([]FoodMerchantInfo, error)
	GetFoodMerchantDetail(ctx context.Context, merchantID string) (*FoodMerchantInfo, error)
	// FB-084 REORDER: validasi ulang item order food lama (harga + availability)
	// sebelum customer klik "Pesan Lagi". Return snapshot vs harga sekarang.
	CheckReorder(ctx context.Context, orderID string) (*ReorderCheckResult, error)
	CreateInternalAggregatorOrder(ctx context.Context, userID string, req CreateOrderRequest) (*Order, error)
	CreateBulkOrder(ctx context.Context, userID string, req CreateBulkOrderRequest) ([]*Order, string, error)
	GetOrder(ctx context.Context, orderID string) (*Order, error)
	ListOrders(ctx context.Context, userID string, filter map[string]interface{}) ([]*Order, error)
	UpdateStatus(ctx context.Context, orderID string, status OrderStatus) error
	// GetCourierIDByUserID — AUDIT-FIX m5: cari courier_profiles.id milik
	// user (JWT) — dipakai handler untuk validasi kepemilikan order sebelum
	// kurir mengubah status (sebelumnya kurir mana pun bisa ubah order mana
	// pun, termasuk cancel order yang tidak di-assign ke dia).
	GetCourierIDByUserID(ctx context.Context, userID string) (string, error)
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
	// SetAvailabilityRepository injects capability and availability state for
	// dispatch eligibility checks.
	SetAvailabilityRepository(ar AvailabilityRepository)
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
	// ── FOOD-BIKE-070: Favorite Merchants (C3) ──
	// AddFavoriteMerchant: customer bookmark merchant untuk quick access.
	AddFavoriteMerchant(ctx context.Context, customerID, merchantID string) error
	// RemoveFavoriteMerchant: customer hapus bookmark.
	RemoveFavoriteMerchant(ctx context.Context, customerID, merchantID string) error
	// ListFavoriteMerchants: customer lihat daftar favorite merchant + detail dasar.
	ListFavoriteMerchants(ctx context.Context, customerID string) ([]FoodMerchantInfo, error)
	// CheckIsFavoriteMerchant: cek apakah merchant sudah di-favorite customer.
	CheckIsFavoriteMerchant(ctx context.Context, customerID, merchantID string) (bool, error)
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
	// ProcessScheduledOrderActivation dipanggil scheduled_order_worker (FB-123):
	// order status 'scheduled' yang sudah due → re-validasi merchant →
	// pending_merchant + NotifyMerchantNewOrder, atau auto-cancel + refund 100%.
	ProcessScheduledOrderActivation(ctx context.Context) error
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
	// UpdateLegsStatus — FB-121: tandai leg aktif order sbg final (delivered/cancelled).
	UpdateLegsStatus(ctx context.Context, orderID string, status OrderStatus) error
	// GetCourierIDByUserID — AUDIT-FIX m5: courier_profiles.id milik user.
	GetCourierIDByUserID(ctx context.Context, userID string) (string, error)
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
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
	Category       string  `json:"category"`
	Address        string  `json:"address"`
	IsActive       bool    `json:"is_active"`
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
	// EventVersion is a monotonic client cursor derived from the server event
	// timestamp. StateVersion, when available, is the authoritative order CAS
	// version; clients must resync the snapshot before applying state changes.
	EventVersion int64 `json:"event_version,omitempty"`
	StateVersion int64 `json:"state_version,omitempty"`
}

type MeetingPointService interface {
	SuggestMeetingPoint(ctx context.Context, pickupLat, pickupLng, dropoffLat, dropoffLng float64) ([]map[string]interface{}, error)
	CreateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	UpdateMeetingPoint(ctx context.Context, mp *MeetingPoint) error
	DeleteMeetingPoint(ctx context.Context, id string) error
	GetAnalytics(ctx context.Context) ([]MeetingPointAnalytics, error)
}

type PackageScan struct {
	ID        string `json:"id"`
	OrderID   string `json:"order_id"`
	ScanType  string `json:"scan_type"`
	ScannedBy string `json:"scanned_by"`
	// IdempotencyKey is supplied by the transport layer and is never exposed
	// as part of the public scan representation.
	IdempotencyKey string    `json:"-"`
	HandoffToken   string    `json:"-"`
	ScannedByRole  string    `json:"-"`
	Latitude       float64   `json:"latitude"`
	Longitude      float64   `json:"longitude"`
	WarehouseID    *string   `json:"warehouse_id,omitempty"`
	PhotoURL       *string   `json:"photo_url,omitempty"`
	BagNumber      *string   `json:"bag_number,omitempty"`
	RecordedAt     time.Time `json:"recorded_at"`
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
