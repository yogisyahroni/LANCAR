package handler

import (
	"encoding/json"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// Auto-generated split of OrderHandler methods (god-file refactor).
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
