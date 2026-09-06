package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type ServiceAdjustmentHandler struct {
	service domain.ServiceAdjustmentService
}

func NewServiceAdjustmentHandler(service domain.ServiceAdjustmentService) *ServiceAdjustmentHandler {
	return &ServiceAdjustmentHandler{service: service}
}

func (h *ServiceAdjustmentHandler) Propose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "courier" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya kurir yang ditugaskan dapat mengajukan penyesuaian", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.ProposeServiceAdjustmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.IdempotencyKey = requestIdempotencyKey(r)
	req.CorrelationID = middleware.GetCorrelationID(r.Context())
	result, err := h.service.Propose(r.Context(), &req, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		writeServiceAdjustmentError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(result)
}

func (h *ServiceAdjustmentHandler) ListForOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat melihat penyesuaian", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderID := strings.TrimSpace(r.URL.Query().Get("order_id"))
	result, err := h.service.ListForCustomer(r.Context(), orderID, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		writeServiceAdjustmentError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"adjustments": result, "count": len(result)})
}

func (h *ServiceAdjustmentHandler) Decide(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat menyetujui penyesuaian", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.DecideServiceAdjustmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	req.IdempotencyKey = requestIdempotencyKey(r)
	req.CorrelationID = middleware.GetCorrelationID(r.Context())
	result, err := h.service.Decide(r.Context(), &req, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		writeServiceAdjustmentError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func requestIdempotencyKey(r *http.Request) string {
	key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	if key == "" {
		key = strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	}
	return key
}

func writeServiceAdjustmentError(w http.ResponseWriter, r *http.Request, err error) {
	code := "ERR_SERVICE_ADJUSTMENT"
	status := http.StatusBadRequest
	switch {
	case errors.Is(err, domain.ErrServiceAdjustmentForbidden):
		status, code = http.StatusForbidden, "ERR_SERVICE_ADJUSTMENT_FORBIDDEN"
	case errors.Is(err, domain.ErrServiceAdjustmentNotFound):
		status, code = http.StatusNotFound, "ERR_SERVICE_ADJUSTMENT_NOT_FOUND"
	case errors.Is(err, domain.ErrServiceAdjustmentMissingQuote):
		status, code = http.StatusConflict, "ERR_INITIAL_QUOTE_REQUIRED"
	case errors.Is(err, domain.ErrServiceAdjustmentStale):
		status, code = http.StatusConflict, "ERR_SERVICE_ADJUSTMENT_STALE"
	case errors.Is(err, domain.ErrServiceAdjustmentConflict):
		status, code = http.StatusConflict, "ERR_SERVICE_ADJUSTMENT_CONFLICT"
	case errors.Is(err, domain.ErrServiceAdjustmentIdempotencyConflict):
		status, code = http.StatusConflict, "ERR_IDEMPOTENCY_CONFLICT"
	case errors.Is(err, domain.ErrInvalidServiceAdjustment):
		status, code = http.StatusBadRequest, "ERR_INVALID_SERVICE_ADJUSTMENT"
	}
	middleware.WriteError(w, status, code, err.Error(), middleware.GetCorrelationID(r.Context()))
}
