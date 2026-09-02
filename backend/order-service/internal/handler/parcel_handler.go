package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"tembus/order-service/pkg/utils"
	"time"
)

// Auto-generated split of OrderHandler methods (god-file refactor).
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
		// AUDIT-FIX m5: kurir wajib punya order ini.
		// order_legs.courier_id DAN JWT userID sama-sama user_id (FK -> users.id),
		// jadi bandingkan langsung dengan userID — jangan resolve ke
		// courier_profiles.id (mismatch domain -> ERR_FORBIDDEN palsu).
		if isCourier {
			if targetOrder == nil || targetOrder.CourierID == nil || *targetOrder.CourierID != userID {
				middleware.LogJSON("warn", "courier_not_assigned", middleware.StructuredFields{
					"correlation_id": correlationID,
					"order_id":       orderID,
					"courier_id":     userID,
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
			// order_legs.courier_id = user_id (sama domain dgn JWT) — bandingkan langsung.
			if targetOrder.CourierID == nil || *targetOrder.CourierID != userID {
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

	// Apply the canonical lifecycle contract after endpoint-level ownership
	// checks. This keeps the generic compatibility endpoint from bypassing the
	// service/actor transition matrix used by internal orchestration.
	if targetOrder != nil {
		actor := domain.OrderActor("unknown")
		switch {
		case isAdmin:
			actor = domain.OrderActorAdmin
		case isCourier:
			actor = domain.OrderActorCourier
		case isCustomer:
			actor = domain.OrderActorCustomer
		case role == "merchant":
			actor = domain.OrderActorMerchant
		}
		category := targetOrder.ServiceCategory
		if category == "" {
			targetOrder.ApplyCanonicalOrderContract()
			category = targetOrder.ServiceCategory
		}
		if transitionErr := domain.ValidateOrderTransition(targetOrder.Status, status, actor, category); transitionErr != nil {
			middleware.WriteError(w, http.StatusConflict, "ERR_INVALID_ORDER_TRANSITION", transitionErr.Error(), correlationID)
			return
		}
	}

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
