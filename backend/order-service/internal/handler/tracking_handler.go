package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
	"lancar/order-service/internal/middleware"
)

type TrackingHandler struct {
	trackingSvc domain.TrackingService
}

func NewTrackingHandler(svc domain.TrackingService) *TrackingHandler {
	return &TrackingHandler{trackingSvc: svc}
}

func (h *TrackingHandler) UpdateLocation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req domain.CourierLocationUpdate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	// In a real scenario, the courier ID could come from the JWT token.
	// We'll trust the payload for now.
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if ok && userID != "" {
		if u, err := uuid.Parse(userID); err == nil {
			// If it's a real user token, enforce courierID match.
			req.CourierID = u
		}
	}

	if err := h.trackingSvc.UpdateLocation(r.Context(), req); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *TrackingHandler) GetTracking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	orderIDStr := r.URL.Query().Get("order_id")
	if orderIDStr == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_MISSING_ORDER_ID", "order_id query parameter is required", middleware.GetCorrelationID(r.Context()))
		return
	}

	orderID, err := uuid.Parse(orderIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ORDER_ID", "order_id is not a valid UUID", middleware.GetCorrelationID(r.Context()))
		return
	}

	resp, err := h.trackingSvc.GetTrackingByOrder(r.Context(), orderID)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "ERR_NOT_FOUND", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, resp)
}
