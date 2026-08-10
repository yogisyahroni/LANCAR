package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/pkg/utils"
	"time"
)

type OrderHandler struct {
	pricingSvc      domain.PricingService
	orderSvc        domain.OrderService
	meetingPointSvc domain.MeetingPointService
}

func NewOrderHandler(p domain.PricingService, o domain.OrderService, m domain.MeetingPointService) *OrderHandler {
	return &OrderHandler{
		pricingSvc:      p,
		orderSvc:        o,
		meetingPointSvc: m,
	}
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

	switch {
	case errors.Is(err, domain.ErrNotFound):
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Data tidak ditemukan", correlationID)
	case errors.Is(err, domain.ErrForbidden):
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
	case errors.Is(err, domain.ErrConflict):
		middleware.WriteError(w, http.StatusConflict, "ERR_CONFLICT", "Operasi konflik. Coba lagi.", correlationID)
	case errors.Is(err, domain.ErrInvalidEstimate):
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ESTIMATE", "Estimasi harga tidak valid atau sudah kedaluwarsa", correlationID)
	case errors.Is(err, domain.ErrLocationNotCovered):
		middleware.WriteError(w, http.StatusBadRequest, "ERR_LOCATION_NOT_COVERED", "Alamat pickup atau tujuan tidak tercover oleh layanan kami", correlationID)
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
func (h *OrderHandler) Estimate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.PricingEstimateRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	resp, err := h.pricingSvc.EstimatePrice(r.Context(), req)
	if err != nil {
		var modelErr *domain.ModelUnavailableError
		if errors.As(err, &modelErr) {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusServiceUnavailable, modelErr.MessageID, modelErr.UserMsg, correlationID)
			return
		}
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

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
func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// userID comes from JWT middleware (trusted — set by AuthMiddleware)
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateOrderRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	order, err := h.orderSvc.CreateOrder(r.Context(), userID, *req)
	if err != nil {
		var modelErr *domain.ModelUnavailableError
		if errors.As(err, &modelErr) {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusServiceUnavailable, modelErr.MessageID, modelErr.UserMsg, correlationID)
			return
		}
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(order)
}

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
func (h *OrderHandler) CreateFoodOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateFoodOrderRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	order, err := h.orderSvc.CreateFoodOrder(r.Context(), userID, *req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(order)
}

// ─────────────────────────────────────────────────────────────
// FOOD DELIVERY — Browse merchant (FOOD-BIKE-055/056)
// GET /api/v1/food/merchants?lat=..&lng=..&search=..
// GET /api/v1/food/merchants/{id}
// ─────────────────────────────────────────────────────────────
func (h *OrderHandler) ListFoodMerchants(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	lat, errLat := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, errLng := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if errLat != nil || errLng != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_LOCATION", "lat/lng wajib dikirim", correlationID)
		return
	}
	search := r.URL.Query().Get("search")
	// ADR 003: filter halal — all|"" (semua) | halal_certified | non_halal.
	halal := r.URL.Query().Get("halal")
	if halal != "halal_certified" && halal != "non_halal" {
		halal = ""
	}

	merchants, err := h.orderSvc.ListFoodMerchants(r.Context(), lat, lng, search, halal)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"merchants": merchants})
}

func (h *OrderHandler) GetFoodMerchantDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "merchant id wajib dikirim", correlationID)
		return
	}

	merchant, err := h.orderSvc.GetFoodMerchantDetail(r.Context(), merchantID)
	if err != nil {
		userSafeError(w, r, err, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"merchant": merchant})
}

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
func (h *OrderHandler) CreateBulkOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	req, ok := middleware.GetValidatedData(r.Context()).(*domain.CreateBulkOrderRequest)
	if !ok || req == nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to retrieve validated request", correlationID)
		return
	}

	orders, batchID, err := h.orderSvc.CreateBulkOrder(r.Context(), userID, *req)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"batch_id": batchID,
		"orders":   orders,
	})
}

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
func (h *OrderHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Identity from JWT (server-set, not client-controlled)
	userID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}

	order, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		// Always respond 404 for not-found so IDs can't be enumerated
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.LogJSON("warn", "get_order_failed", middleware.StructuredFields{
			"correlation_id": correlationID,
			"order_id":       id,
			"user_id":        userID,
			"error":          err.Error(),
		})
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
		return
	}

	// Authorization: admins bypass; others must own the order or be the assigned courier.
	isAdmin := role == "admin" || role == "super_admin"
	isOwner := order.CustomerID == userID
	isAssignedCourier := false
	if order.CourierID != nil && *order.CourierID == userID {
		isAssignedCourier = true
	}

	if !isAdmin && !isOwner && !isAssignedCourier {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.LogJSON("warn", "unauthorized_order_access", middleware.StructuredFields{
			"correlation_id": correlationID,
			"order_id":       id,
			"requester_id":   userID,
			"requester_role": role,
			"owner_id":       order.CustomerID,
		})
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(order)
}

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
func (h *OrderHandler) ReorderCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", correlationID)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}

	// Ownership check: hanya pemilik order (pola GetOrder).
	order, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
		return
	}
	if order.CustomerID != userID {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
		return
	}

	result, err := h.orderSvc.CheckReorder(r.Context(), id)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_REORDER_UNAVAILABLE", err.Error(), correlationID)
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, result)
}

// ListOrders godoc
// @Summary List customer orders
// @Description Get a list of orders for the authenticated user
// @Tags orders
// @Produce json
// @Security Bearer
// @Success 200 {array} domain.Order
// @Router /orders [get]
func (h *OrderHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	orders, err := h.orderSvc.ListOrders(r.Context(), userID, nil)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(orders)
}

// PollOrderUpdates godoc
// @Summary Poll for order status updates
// @Description Fallback mechanism for WebSocket failures
// @Tags orders
// @Produce json
// @Security Bearer
// @Param since query string false "ISO8601 timestamp"
// @Success 200 {array} domain.OrderEvent
// @Router /orders/poll [get]
func (h *OrderHandler) PollOrderUpdates(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	sinceStr := r.URL.Query().Get("since")
	since := time.Now().Add(-1 * time.Minute) // Default to last minute
	if sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = t
		}
	}

	events, err := h.orderSvc.ListEvents(r.Context(), userID, since)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(events)
}

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
func (h *OrderHandler) SuggestMeetingPoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pickupLat := utils.ParseFloat(r.URL.Query().Get("pickup_lat"))
	pickupLng := utils.ParseFloat(r.URL.Query().Get("pickup_lng"))
	dropoffLat := utils.ParseFloat(r.URL.Query().Get("dropoff_lat"))
	dropoffLng := utils.ParseFloat(r.URL.Query().Get("dropoff_lng"))

	if pickupLat == 0 || pickupLng == 0 || dropoffLat == 0 || dropoffLng == 0 {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Missing required coordinates", correlationID)
		return
	}

	suggestions, err := h.meetingPointSvc.SuggestMeetingPoint(r.Context(), pickupLat, pickupLng, dropoffLat, dropoffLng)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(suggestions)
}

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
func (h *OrderHandler) AcceptOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Query().Get("id")
	if orderID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}

	courierID := middleware.GetUserIDFromContext(r.Context())
	if courierID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Only couriers can accept orders
	role := middleware.GetRoleFromContext(r.Context())
	if role != "courier" && role != "admin" && role != "super_admin" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya kurir yang dapat menerima order", correlationID)
		return
	}

	err := h.orderSvc.AcceptOrder(r.Context(), orderID, courierID)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "accepted", "order_id": orderID})
}

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
	domain.StatusScheduled:        true,
	domain.StatusFailedDelivery:   true,
	domain.StatusReturnToSender:   true,
	domain.StatusPendingMerchant:  true, // food: masih menunggu merchant
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
func (h *OrderHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Identity from JWT — must be present
	userID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if userID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	var req UpdateStatusRequest
	var orderID string
	var status domain.OrderStatus

	// Check if it's a JSON body (as sent by Android)
	if r.Header.Get("Content-Type") == "application/json" {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", correlationID)
			return
		}
		orderID = req.OrderID
		status = domain.OrderStatus(req.Status)
	} else {
		// Fallback to query params for compatibility
		orderID = r.URL.Query().Get("id")
		status = domain.OrderStatus(r.URL.Query().Get("status"))
	}

	if orderID == "" || status == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID dan status wajib diisi", correlationID)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())
	isAdmin := role == "admin" || role == "super_admin"
	isCourier := role == "courier"
	isCustomer := role == "customer"

	// ── Role-based state machine enforcement ──────────────────────────────
	// AUDIT-FIX m5: validasi diperluas ke SEMUA role (bukan cuma customer):
	//   • kurir hanya boleh ubah status order yang courier_id = profil dia
	//     (sebelumnya kurir mana pun bisa ubah/cancel order mana pun);
	//   • cancel tidak lagi "bebas" untuk admin/kurir — status order harus
	//     dalam daftar cancellable (membunuh cancel order delivered →
	//     refund order yang sudah selesai).
	var targetOrder *domain.Order
	if order, errGet := h.orderSvc.GetOrder(r.Context(), orderID); errGet == nil {
		targetOrder = order
	}
	if courierOnlyStatuses[status] {
		// Only couriers and admins may set delivery-lifecycle statuses.
		// This is the primary fix for courier-fraud: customer cannot self-mark as delivered.
		if !isCourier && !isAdmin {
			middleware.LogJSON("warn", "unauthorized_status_update", middleware.StructuredFields{
				"correlation_id": correlationID,
				"order_id":       orderID,
				"attempted_role": role,
				"attempted_user": userID,
				"status":         string(status),
			})
			middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN",
				"Hanya kurir yang dapat mengubah status pengiriman ini", correlationID)
			return
		}
		// AUDIT-FIX m5: kurir wajib punya order ini (courier_id = profil dia).
		if isCourier {
			courierID, errC := h.orderSvc.GetCourierIDByUserID(r.Context(), userID)
			if errC != nil || courierID == "" {
				middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN",
					"Profil kurir tidak ditemukan", correlationID)
				return
			}
			if targetOrder == nil || targetOrder.CourierID == nil || *targetOrder.CourierID != courierID {
				middleware.LogJSON("warn", "courier_not_assigned", middleware.StructuredFields{
					"correlation_id": correlationID,
					"order_id":       orderID,
					"courier_id":     courierID,
					"status":         string(status),
				})
				middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN",
					"Order ini bukan tugas kurir kamu", correlationID)
				return
			}
		}
	} else if status == domain.StatusCancelled {
		if targetOrder == nil {
			middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
			return
		}
		// Kepemilikan: customer hanya order sendiri, kurir hanya order sendiri.
		if isCustomer && targetOrder.CustomerID != userID {
			middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
			return
		}
		if isCourier {
			courierID, errC := h.orderSvc.GetCourierIDByUserID(r.Context(), userID)
			if errC != nil || courierID == "" {
				middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN",
					"Profil kurir tidak ditemukan", correlationID)
				return
			}
			if targetOrder.CourierID == nil || *targetOrder.CourierID != courierID {
				middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN",
					"Order ini bukan tugas kurir kamu", correlationID)
				return
			}
		}
		// Eligibility status untuk SEMUA role — tidak bisa cancel order yang
		// sudah selesai/final (delivered) atau sudah batal (double cancel).
		if !cancellableStatuses[targetOrder.Status] {
			middleware.WriteError(w, http.StatusConflict, "ERR_CONFLICT",
				"Order tidak dapat dibatalkan pada status ini", correlationID)
			return
		}
	}
	// ─────────────────────────────────────────────────────────────────────

	// Update dimensions if provided (Enterprise Volumetric Consistency)
	if req.Length != nil || req.Width != nil || req.Height != nil || req.Weight != nil {
		if err := h.orderSvc.UpdateDimensions(r.Context(), orderID, req.Length, req.Width, req.Height, req.Weight); err != nil {
			middleware.LogJSON("warn", "update_dimensions_failed", middleware.StructuredFields{
				"correlation_id": correlationID,
				"order_id":       orderID,
				"error":          err.Error(),
			})
		}
	}

	err := h.orderSvc.UpdateStatus(r.Context(), orderID, status)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": string(status), "order_id": orderID})
}

// StartMatching triggers automated courier assignment for an order
func (h *OrderHandler) StartMatching(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	role := middleware.GetRoleFromContext(r.Context())
	if role != "admin" && role != "super_admin" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya admin yang dapat melakukan pencarian kurir otomatis", correlationID)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}

	// Fix VULN-003: Check if order is eligible
	order, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
		return
	}
	if order.Status != domain.StatusPendingAssignment {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusConflict, "ERR_CONFLICT", "Pencarian kurir hanya bisa dilakukan jika order dalam status pending_assignment", correlationID)
		return
	}

	err = h.orderSvc.StartMatching(r.Context(), id)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "searching", "order_id": id})
}

// RetryMatching triggers courier assignment retry for an order that timed out
func (h *OrderHandler) RetryMatching(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}

	userID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	order, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
		return
	}

	isAdmin := role == "admin" || role == "super_admin"
	isOwner := order.CustomerID == userID
	if !isAdmin && !isOwner {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
		return
	}

	if order.Status != domain.StatusNoCourierFound && order.Status != domain.StatusSearching {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusConflict, "ERR_CONFLICT", "Order hanya bisa di-retry dari status no_courier_found atau searching", correlationID)
		return
	}

	err = h.orderSvc.RetryMatching(r.Context(), id)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "searching", "order_id": id})
}

// InternalStartMatching triggers automated courier assignment from internal orchestration without JWT
func (h *OrderHandler) InternalStartMatching(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		id = r.PathValue("id")
	}
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}
	err := h.orderSvc.StartMatching(r.Context(), id)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "searching", "order_id": id})
}

// InternalRetryMatching triggers courier assignment retry from internal orchestration without JWT
func (h *OrderHandler) InternalRetryMatching(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := r.URL.Query().Get("id")
	if id == "" {
		id = r.PathValue("id")
	}
	if id == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "Order ID is required", correlationID)
		return
	}
	err := h.orderSvc.RetryMatching(r.Context(), id)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "searching", "order_id": id})
}

// ScanRequest represents the request payload for scanning a package
type ScanRequest struct {
	OrderID     string  `json:"order_id"`
	ScanType    string  `json:"scan_type"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	WarehouseID *string `json:"warehouse_id,omitempty"`
	PhotoURL    *string `json:"photo_url,omitempty"`
	BagNumber   *string `json:"bag_number,omitempty"`
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
func (h *OrderHandler) ScanPackage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	scannedBy := middleware.GetUserIDFromContext(r.Context())
	if scannedBy == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Scan Auth Bypass — hanya petugas (admin/courier/warehouse)
	// yang boleh mencatat scan; customer tidak boleh inject scan history
	// atau memaksa state transition order milik orang lain.
	role := middleware.GetRoleFromContext(r.Context())
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat melakukan scan paket", correlationID)
		return
	}

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	if req.OrderID == "" || req.ScanType == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "order_id and scan_type are required", correlationID)
		return
	}

	scan := &domain.PackageScan{
		OrderID:     req.OrderID,
		ScanType:    req.ScanType,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		WarehouseID: req.WarehouseID,
		PhotoURL:    req.PhotoURL,
		BagNumber:   req.BagNumber,
	}

	err := h.orderSvc.ScanPackage(r.Context(), scannedBy, scan)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "success",
		"scan_id":     scan.ID,
		"scan_type":   scan.ScanType,
		"order_id":    scan.OrderID,
		"recorded_at": scan.RecordedAt,
	})
}

// GetPackageScans godoc
// @Summary Get package scans history
// @Description Retrieve the full history of scans for an order
// @Tags orders
// @Produce json
// @Security Bearer
// @Param order_id query string true "Order ID"
// @Success 200 {array} domain.PackageScan
// @Router /orders/scans [get]
func (h *OrderHandler) GetPackageScans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Query().Get("order_id")
	if orderID == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "order_id is required", correlationID)
		return
	}

	// Fix VULN-001: Scans Auth Bypass
	userID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	if role == "customer" {
		order, err := h.orderSvc.GetOrder(r.Context(), orderID)
		if err != nil {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan", correlationID)
			return
		}
		if order.CustomerID != userID {
			correlationID := middleware.GetCorrelationID(r.Context())
			middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Akses ditolak", correlationID)
			return
		}
	} else if role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	scans, err := h.orderSvc.GetPackageScans(r.Context(), orderID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(scans)
}

type CreateBagRequest struct {
	BagNumber              string  `json:"bag_number"`
	VehiclePlate           *string `json:"vehicle_plate,omitempty"`
	FlightNumber           *string `json:"flight_number,omitempty"`
	OriginWarehouseID      *string `json:"origin_warehouse_id,omitempty"`
	DestinationWarehouseID *string `json:"destination_warehouse_id,omitempty"`
}

func (h *OrderHandler) CreateConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	createdBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())

	if createdBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat membuat kantong", correlationID)
		return
	}

	var req CreateBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	bag := &domain.ConsolidationBag{
		BagNumber:              req.BagNumber,
		VehiclePlate:           req.VehiclePlate,
		FlightNumber:           req.FlightNumber,
		OriginWarehouseID:      req.OriginWarehouseID,
		DestinationWarehouseID: req.DestinationWarehouseID,
	}

	err := h.orderSvc.CreateConsolidationBag(r.Context(), createdBy, bag)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(bag)
}

type OpenBagRequest struct {
	BagNumber string `json:"bag_number"`
}

func (h *OrderHandler) OpenConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	unbaggedBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if unbaggedBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat membuka kantong", correlationID)
		return
	}

	var req OpenBagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	err := h.orderSvc.OpenConsolidationBag(r.Context(), unbaggedBy, req.BagNumber)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "success", "bag_number": req.BagNumber, "message": "Bag opened successfully (Bag Out)"})
}

func (h *OrderHandler) GetConsolidationBag(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bagNumber := r.URL.Query().Get("bag_number")
	if bagNumber == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_PARAM", "bag_number is required", correlationID)
		return
	}

	// Fix VULN-001: Bag Auth Bypass
	role := middleware.GetRoleFromContext(r.Context())
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat mengakses data kantong", correlationID)
		return
	}

	bag, scans, err := h.orderSvc.GetConsolidationBag(r.Context(), bagNumber)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"bag":   bag,
		"scans": scans,
	})
}

type AutoDetectRequest struct {
	OrderID     string `json:"order_id"`
	WarehouseID string `json:"warehouse_id"`
}

func (h *OrderHandler) AutoDetectScanType(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Fix VULN-001: AutoDetect — hanya petugas yang boleh auto-detect scan type
	scannedBy := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if scannedBy == "" || role == "" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", correlationID)
		return
	}
	if role != "admin" && role != "super_admin" && role != "courier" && role != "warehouse" {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat melakukan auto-detect scan", correlationID)
		return
	}

	var req AutoDetectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		correlationID := middleware.GetCorrelationID(r.Context())
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request payload", correlationID)
		return
	}

	scanType, err := h.orderSvc.AutoDetectScanType(r.Context(), req.OrderID, req.WarehouseID)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"order_id":  req.OrderID,
		"scan_type": scanType,
		"status":    "success",
	})
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
func (h *OrderHandler) SubmitCourierRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	// Ambil customerID dari JWT context (sudah divalidasi middleware)
	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	// Ambil orderID dari URL path: /api/v1/customer/orders/{id}/rating
	// Asumsi format: /api/v1/customer/orders/O-XYZ/rating
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 7 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak ditemukan di URL", correlationID)
		return
	}
	orderID := pathParts[5]
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak valid", correlationID)
		return
	}

	var req domain.SubmitRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid", correlationID)
		return
	}

	if err := h.orderSvc.SubmitRating(r.Context(), customerID, orderID, req); err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":   "success",
		"message":  "Terima kasih atas penilaian Anda!",
		"order_id": orderID,
	})
}

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
func (h *OrderHandler) SubmitMerchantRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	// Path: /api/v1/customer/orders/{id}/merchant-rating
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 7 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak ditemukan di URL", correlationID)
		return
	}
	orderID := pathParts[5]
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Order ID tidak valid", correlationID)
		return
	}

	var req domain.SubmitRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid", correlationID)
		return
	}

	if err := h.orderSvc.SubmitMerchantRating(r.Context(), customerID, orderID, req); err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":   "success",
		"message":  "Terima kasih atas penilaian Anda!",
		"order_id": orderID,
	})
}

// GetRatingReminders godoc
// @Summary Get orders that need rating reminder
// @Description Mengambil list order delivered milik customer yang belum di-rating.
// @Tags orders
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /api/v1/customer/rating-reminders [get]
func (h *OrderHandler) GetRatingReminders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	correlationID := middleware.GetCorrelationID(r.Context())

	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid", correlationID)
		return
	}

	orders, err := h.orderSvc.GetOrdersNeedingRatingReminder(r.Context(), customerID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	// Format response: tampilkan data kurir yang relevan untuk UI dialog rating
	type RatingReminderItem struct {
		OrderID         string `json:"order_id"`
		OrderNumber     string `json:"order_number"`
		CourierName     string `json:"courier_name"`
		CourierPhotoURL string `json:"courier_photo_url"`
		CourierPlate    string `json:"courier_plate"`
		ReminderCount   int    `json:"reminder_count"`
	}

	items := make([]RatingReminderItem, 0, len(orders))
	for _, o := range orders {
		item := RatingReminderItem{
			OrderID:       o.ID,
			OrderNumber:   o.OrderNumber,
			ReminderCount: o.RatingReminderCount,
		}
		if o.Courier != nil {
			item.CourierName = o.Courier.FullName
			item.CourierPhotoURL = o.Courier.ProfilePhotoURL
			item.CourierPlate = o.Courier.VehiclePlate
		}
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    items,
	})
}

// GetCourierPerformance godoc
// @Summary Get courier performance stats
// @Description Fetch current performance stats including tier, rating, and metrics for the logged-in courier
// @Tags couriers
// @Produce json
// @Security BearerAuth
// @Success 200 {object} domain.CourierPerformanceStats
// @Router /couriers/me/performance [get]
func (h *OrderHandler) GetCourierPerformance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	courierID := r.Context().Value("user_id").(string)

	stats, err := h.orderSvc.GetCourierPerformanceStats(r.Context(), courierID)
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}
