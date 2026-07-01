package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type RelayHandler struct {
	relayScoreSvc domain.RelayScoreService
}

func NewRelayHandler(relayScoreSvc domain.RelayScoreService) *RelayHandler {
	return &RelayHandler{relayScoreSvc: relayScoreSvc}
}

type AdminOverrideScoreRequest struct {
	CourierID uuid.UUID `json:"courier_id"`
	NewScore  float64   `json:"new_score"`
	Note      string    `json:"note"`
}

func (h *RelayHandler) AdminOverrideScore(w http.ResponseWriter, r *http.Request) {
	// Assume admin ID is from auth header for this mock
	adminIDStr := r.Header.Get("X-User-ID")
	if adminIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	adminID, err := uuid.Parse(adminIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid admin ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req AdminOverrideScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request", middleware.GetCorrelationID(r.Context()))
		return
	}

	err = h.relayScoreSvc.AdminOverrideScore(r.Context(), req.CourierID, req.NewScore, adminID, req.Note)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Internal server error", middleware.GetCorrelationID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Courier score successfully overridden by admin",
	})
}

type AdminOverrideTierRequest struct {
	NewTier   string    `json:"new_tier"`
	Note      string    `json:"note"`
}

func (h *RelayHandler) AdminOverrideTier(w http.ResponseWriter, r *http.Request) {
	adminIDStr := r.Header.Get("X-User-ID")
	if adminIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	adminID, err := uuid.Parse(adminIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid admin ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	courierIDStr := r.PathValue("id")
	courierID, err := uuid.Parse(courierIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid courier ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req AdminOverrideTierRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}

	err = h.relayScoreSvc.AdminOverrideTier(r.Context(), courierID, req.NewTier, adminID, req.Note)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Courier tier successfully overridden by admin",
	})
}

func (h *RelayHandler) ListCourierPerformance(w http.ResponseWriter, r *http.Request) {
	adminIDStr := r.Header.Get("X-User-ID")
	if adminIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	limit := 10
	offset := 0
	search := r.URL.Query().Get("search")

	stats, err := h.relayScoreSvc.ListCourierPerformanceStats(r.Context(), limit, offset, search)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}
