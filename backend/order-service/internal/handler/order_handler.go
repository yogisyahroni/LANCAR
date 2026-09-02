package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type OrderHandler struct {
	pricingSvc      domain.PricingService
	orderSvc        domain.OrderService
	meetingPointSvc domain.MeetingPointService
	handoffSvc      domain.HandoffService
}

func NewOrderHandler(p domain.PricingService, o domain.OrderService, m domain.MeetingPointService) *OrderHandler {
	return &OrderHandler{
		pricingSvc:      p,
		orderSvc:        o,
		meetingPointSvc: m,
	}
}

func (h *OrderHandler) SetHandoffService(svc domain.HandoffService) {
	h.handoffSvc = svc
}

// userSafeError maps internal errors to safe user-facing messages and
// logs the internal error detail via structured JSON. It never exposes
// database errors, stack traces, or internal service URLs to callers.
//
// Fix: S2-OS-02 / S2-PS-02 — replaces all bare err.Error() in responses.
func userSafeError(w http.ResponseWriter, r *http.Request, err error, defaultStatus int) {
	correlationID := middleware.GetCorrelationID(r.Context())

	// Log the real error internally (redacted by LogJSON)
	middleware.LogJSON("error", "handler_error", middleware.StructuredFields{
		"correlation_id": correlationID,
		"path":           r.URL.Path,
		"method":         r.Method,
		"error":          err.Error(),
	})

	var ufe *domain.UserFacingError
	var requoteErr *domain.RequoteRequiredError
	var concurrentErr *domain.ConcurrentOrderTransitionError

	switch {
	case errors.As(err, &requoteErr):
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":                 false,
			"code":                    "REQUOTE_REQUIRED",
			"message":                 "Quote perlu dihitung ulang sebelum order dapat dibuat.",
			"quote_id":                requoteErr.QuoteID,
			"current_total_price_idr": requoteErr.CurrentTotal,
			"requires_requote":        true,
			"correlation_id":          correlationID,
			"action":                  "Tinjau harga terbaru lalu lanjutkan kembali.",
			"retryable":               false,
		})
	case errors.Is(err, domain.ErrNotFound):
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Data tidak ditemukan", correlationID)
	case errors.Is(err, domain.ErrForbidden):
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
	case errors.Is(err, domain.ErrForbiddenItem):
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN_ITEM", "Barang ini tidak dapat dikirim melalui layanan TEMBUS.", correlationID)
	case errors.Is(err, domain.ErrConflict):
		middleware.WriteError(w, http.StatusConflict, "ERR_CONFLICT", "Operasi konflik. Coba lagi.", correlationID)
	case errors.Is(err, domain.ErrInvalidEstimate):
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ESTIMATE", "Estimasi harga tidak valid atau sudah kedaluwarsa", correlationID)
	case errors.Is(err, domain.ErrInvalidCoordinates):
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_COORDINATES", "Pilih titik pickup dan tujuan yang valid", correlationID)
	case errors.Is(err, domain.ErrLocationNotCovered):
		middleware.WriteError(w, http.StatusBadRequest, "OUT_OF_SERVICE_AREA", "Alamat pickup atau tujuan tidak tercover oleh layanan kami", correlationID)
	case errors.Is(err, domain.ErrOrderAlreadyAssigned):
		middleware.WriteError(w, http.StatusConflict, "ERR_ORDER_ALREADY_ASSIGNED", "Order sudah diterima kurir lain", correlationID)
	case errors.Is(err, domain.ErrTransitionProofRequired):
		middleware.WriteError(w, http.StatusConflict, "PROOF_REQUIRED", "Bukti pengantaran wajib tersedia sebelum order diselesaikan", correlationID)
	case errors.Is(err, domain.ErrTransitionLedgerRequired):
		middleware.WriteError(w, http.StatusConflict, "ERR_TRANSITION_LEDGER_REQUIRED", "Efek ledger order belum siap, status tidak diubah", correlationID)
	case errors.Is(err, domain.ErrAdminOverrideReasonRequired):
		middleware.WriteError(w, http.StatusBadRequest, "ERR_ADMIN_OVERRIDE_REASON_REQUIRED", "Alasan admin override wajib diisi", correlationID)
	case errors.As(err, &concurrentErr):
		middleware.WriteError(w, http.StatusConflict, "INVALID_TRANSITION", "Order berubah bersamaan, silakan coba lagi", correlationID)
	case errors.Is(err, domain.ErrHandoffTokenInvalid), errors.Is(err, domain.ErrHandoffTokenExpired),
		errors.Is(err, domain.ErrHandoffTokenConsumed), errors.Is(err, domain.ErrHandoffTokenAttemptsLimit),
		errors.Is(err, domain.ErrHandoffActorMismatch), errors.Is(err, domain.ErrHandoffOrderMismatch),
		errors.Is(err, domain.ErrHandoffStageMismatch):
		middleware.WriteError(w, http.StatusConflict, "HANDOFF_INVALID", "Verifikasi serah-terima tidak valid", correlationID)
	case errors.As(err, &ufe) && ufe.UserMsg != "":
		// UAT-C-012/C-014: error bisnis user-facing → tampilkan pesan asli
		// (bukan ERR_INTERNAL generic).
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", ufe.UserMsg, correlationID)
	default:
		status := defaultStatus
		if status == 0 {
			status = http.StatusInternalServerError
		}
		middleware.WriteError(w, status, "ERR_INTERNAL", "Terjadi kesalahan internal. Silakan coba lagi.", correlationID)
	}
}

// Estimate godoc
// @Summary Estimate pricing
// @Description Get pricing estimate for an order without creating it
// @Tags pricing
// @Accept json
// @Produce json
// @Param request body domain.PricingEstimateRequest true "Pricing Estimate Request"
// @Success 200 {object} domain.PricingEstimateResponse
// @Router /pricing/estimate [post]

// CreateOrder godoc
// @Summary Create a new order
// @Description Create a new delivery order
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body domain.CreateOrderRequest true "Create Order Request"
// @Success 201 {object} domain.Order
// @Router /orders [post]

// CreateFoodOrder godoc
// @Summary Create food order (multi-item)
// @Description Create an order for food delivery (merchant → customer, sepeda-only couriers)
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body domain.CreateFoodOrderRequest true "Food Order Request"
// @Success 201 {object} domain.Order
// @Router /orders/food [post]

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — Browse merchant (FOOD-BIKE-055/056)
// GET /api/v1/food/merchants?lat=..&lng=..&search=..
// GET /api/v1/food/merchants/{id}
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// FOOD-BIKE-070: Favorite Merchants (C3)
// POST /api/v1/food/favorites/{merchant_id} — add favorite
// DELETE /api/v1/food/favorites/{merchant_id} — remove favorite
// GET /api/v1/food/favorites — list favorites
// GET /api/v1/food/favorites/check/{merchant_id} — check if favorite
// ─────────────────────────────────────────────────────────────

// GetOrder godoc
// CreateBulkOrder godoc
// @Summary Create bulk order (multidrop)
// @Description Create an order with 1 pickup and multiple destinations
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body domain.CreateBulkOrderRequest true "Bulk Order Request"
// @Success 201 {object} map[string]interface{}
// @Router /orders/bulk [post]

// @Summary Get order details
// @Description Get full details of a specific order
// @Tags orders
// @Produce json
// @Security Bearer
// @Param id query string true "Order ID"
// @Success 200 {object} domain.Order
// @Router /orders/detail [get]
//
// Fix S2-OS-01: Enforces ownership — caller must be the order's customer,
// the assigned courier, or an admin/super_admin. No data is returned otherwise.

// ReorderCheck godoc
// @Summary Cek validasi ulang order food sebelum "Pesan Lagi" (FB-084)
// @Description Bandingkan snapshot harga item order lama vs harga/availability
// menu saat ini. Hanya pemilik order. Order harus food_delivery.
// @Tags orders
// @Produce json
// @Security Bearer
// @Param id query string true "Order ID"
// @Success 200 {object} domain.ReorderCheckResult
// @Router /orders/reorder-info [get]

// ListOrders godoc
// @Summary List customer orders
// @Description Get a list of orders for the authenticated user
// @Tags orders
// @Produce json
// @Security Bearer
// @Success 200 {array} domain.Order
// @Router /orders [get]

// PollOrderUpdates godoc
// @Summary Poll for order status updates
// @Description Fallback mechanism for WebSocket failures
// @Tags orders
// @Produce json
// @Security Bearer
// @Param since query string false "ISO8601 timestamp"
// @Success 200 {array} domain.OrderEvent
// @Router /orders/poll [get]

// SuggestMeetingPoints godoc
// @Summary Suggest meeting points
// @Description Suggest best meeting points for a route
// @Tags orders
// @Produce json
// @Param pickup_lat query number true "Pickup Latitude"
// @Param pickup_lng query number true "Pickup Longitude"
// @Param dropoff_lat query number true "Dropoff Latitude"
// @Param dropoff_lng query number true "Dropoff Longitude"
// @Success 200 {array} map[string]interface{}
// @Router /meeting-points/suggest [get]

// AcceptOrder godoc
// @Summary Accept an order (Courier)
// @Description Accept a pending delivery order
// @Tags couriers
// @Accept json
// @Produce json
// @Security Bearer
// @Param id path string true "Order ID"
// @Success 200 {object} map[string]string
// @Router /couriers/orders/{id}/accept [post]

// UpdateStatusRequest represents the payload for status updates
type UpdateStatusRequest struct {
	OrderID string   `json:"id"`
	Status  string   `json:"status"`
	Length  *float64 `json:"length,omitempty"`
	Width   *float64 `json:"width,omitempty"`
	Height  *float64 `json:"height,omitempty"`
	Weight  *float64 `json:"weight,omitempty"`
	Notes   string   `json:"notes,omitempty"`
}

// courierOnlyStatuses lists the statuses that ONLY couriers (and admins) may set.
// Customers must never be able to forge a delivery completion.
var courierOnlyStatuses = map[domain.OrderStatus]bool{
	domain.StatusPickingUp:           true,
	domain.StatusPickedUp:            true,
	domain.StatusInboundOrigin:       true,
	domain.StatusOutboundOrigin:      true,
	domain.StatusInboundDestination:  true,
	domain.StatusOutboundDestination: true,
	domain.StatusDelivering:          true,
	domain.StatusDelivered:           true, // Critical: courier fraud prevention
}

// cancellableStatuses — AUDIT-FIX m5: status yang masih boleh di-cancel
// lewat endpoint generic /orders/status, berlaku untuk SEMUA role.
// Order delivered (selesai, uang sudah pindah) dan cancelled (sudah batal,
// refund sudah jalan) TIDAK boleh di-cancel lagi → anti-refund order selesai
// & anti double-cancel. failed_delivery / return_to_sender tetap boleh
// (order macet yang butuh resolver admin).
var cancellableStatuses = map[domain.OrderStatus]bool{
	domain.StatusPending:           true,
	domain.StatusPendingPayment:    true,
	domain.StatusPendingAssignment: true,
	domain.StatusSearching:         true,
	domain.StatusNoCourierFound:    true,
	// FB-123: order terjadwal bisa dibatalkan kapanpun sebelum aktivasi
	// (belum ada pihak lain yang mulai kerja).
	domain.StatusScheduled:       true,
	domain.StatusFailedDelivery:  true,
	domain.StatusReturnToSender:  true,
	domain.StatusPendingMerchant: true, // food: masih menunggu merchant
}

// UpdateStatus godoc
// @Summary Update order status (Courier/Admin)
// @Description Update the status of an order
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param body body UpdateStatusRequest true "Update Status Request"
// @Router /orders/status [post]
//
// Fix S2-BE-02: Role-based state machine enforcement.
// Only courier/admin can set transit/delivery statuses.
// Customer can only cancel their own order at eligible statuses.

// StartMatching triggers automated courier assignment for an order

// RetryMatching triggers courier assignment retry for an order that timed out

// InternalStartMatching triggers automated courier assignment from internal orchestration without JWT

// InternalRetryMatching triggers courier assignment retry from internal orchestration without JWT

// ScanRequest represents the request payload for scanning a package
type ScanRequest struct {
	OrderID      string  `json:"order_id"`
	ScanType     string  `json:"scan_type"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	WarehouseID  *string `json:"warehouse_id,omitempty"`
	PhotoURL     *string `json:"photo_url,omitempty"`
	BagNumber    *string `json:"bag_number,omitempty"`
	HandoffToken string  `json:"handoff_token,omitempty"`
}

// ScanPackage godoc
// @Summary Scan a package (Courier/Hub operator)
// @Description Record a new package scan (pickup, inbound, outbound, delivered etc)
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body ScanRequest true "Scan Request Payload"
// @Success 200 {object} map[string]string
// @Router /orders/scan [post]

// GetPackageScans godoc
// @Summary Get package scans history
// @Description Retrieve the full history of scans for an order
// @Tags orders
// @Produce json
// @Security Bearer
// @Param order_id query string true "Order ID"
// @Success 200 {array} domain.PackageScan
// @Router /orders/scans [get]

type CreateBagRequest struct {
	BagNumber              string  `json:"bag_number"`
	VehiclePlate           *string `json:"vehicle_plate,omitempty"`
	FlightNumber           *string `json:"flight_number,omitempty"`
	OriginWarehouseID      *string `json:"origin_warehouse_id,omitempty"`
	DestinationWarehouseID *string `json:"destination_warehouse_id,omitempty"`
}

type OpenBagRequest struct {
	BagNumber string `json:"bag_number"`
}

type AutoDetectRequest struct {
	OrderID     string `json:"order_id"`
	WarehouseID string `json:"warehouse_id"`
}

// SubmitCourierRating godoc
// @Summary Submit courier rating
// @Description Customer memberikan penilaian bintang (1-5) kepada kurir setelah order delivered.
// @Tags orders
// @Accept json
// @Produce json
// @Param id path string true "Order ID"
// @Param request body domain.SubmitRatingRequest true "Rating Request"
// @Success 200 {object} map[string]string
// @Failure 400 {object} middleware.ErrorResponse
// @Failure 403 {object} middleware.ErrorResponse "Bukan pemilik order"
// @Failure 409 {object} middleware.ErrorResponse "Order sudah di-rating sebelumnya"
// @Router /api/v1/customer/orders/{id}/rating [post]

// SubmitMerchantRating godoc — FOOD-BIKE-059/060
// @Summary Submit food merchant rating
// @Description Rating 1-5 bintang untuk merchant (makanan), terpisah dari rating driver.
// @Tags orders
// @Accept json
// @Produce json
// @Security Bearer
// @Param request body domain.SubmitRatingRequest true "Merchant Rating"
// @Success 200 {object} map[string]string
// @Router /api/v1/customer/orders/{id}/merchant-rating [post]

// GetRatingReminders godoc
// @Summary Get orders that need rating reminder
// @Description Mengambil list order delivered milik customer yang belum di-rating.
// @Tags orders
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/customer/rating-reminders [get]

// GetCourierPerformance godoc
// @Summary Get courier performance stats
// @Description Fetch current performance stats including tier, rating, and metrics for the logged-in courier
// @Tags couriers
// @Produce json
// @Security BearerAuth
// @Success 200 {object} domain.CourierPerformanceStats
// @Router /couriers/me/performance [get]
