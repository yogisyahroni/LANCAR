package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
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
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	adminID, err := uuid.Parse(adminIDStr)
	if err != nil {
		http.Error(w, "Invalid admin ID", http.StatusBadRequest)
		return
	}

	var req AdminOverrideScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	err = h.relayScoreSvc.AdminOverrideScore(r.Context(), req.CourierID, req.NewScore, adminID, req.Note)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Courier score successfully overridden by admin",
	})
}
