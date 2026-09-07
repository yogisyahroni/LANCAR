package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type RoadsideCollectionHandler struct {
	service domain.RoadsideCollectionService
}

func NewRoadsideCollectionHandler(s domain.RoadsideCollectionService) *RoadsideCollectionHandler {
	return &RoadsideCollectionHandler{service: s}
}
func (h *RoadsideCollectionHandler) Start(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if middleware.GetRoleFromContext(r.Context()) != "customer" {
		middleware.WriteError(w, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya customer pemilik order yang dapat membayar penyesuaian", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req struct {
		AdjustmentID string `json:"adjustment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.AdjustmentID) == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "adjustment_id wajib", middleware.GetCorrelationID(r.Context()))
		return
	}
	result, err := h.service.Start(r.Context(), req.AdjustmentID, middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		status, code := http.StatusBadRequest, "ERR_ROADSIDE_COLLECTION"
		switch {
		case errors.Is(err, domain.ErrServiceAdjustmentForbidden):
			status, code = http.StatusForbidden, "ERR_FORBIDDEN"
		case errors.Is(err, domain.ErrServiceAdjustmentNotFound):
			status, code = http.StatusNotFound, "ERR_NOT_FOUND"
		case errors.Is(err, domain.ErrServiceAdjustmentConflict):
			status, code = http.StatusConflict, "ERR_COLLECTION_CONFLICT"
		default:
			status, code = http.StatusServiceUnavailable, "ERR_COLLECTION_UNAVAILABLE"
		}
		middleware.WriteError(w, status, code, err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
