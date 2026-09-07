package handler

import (
	"encoding/json"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

func (h *OrderHandler) RecordFoodSponsoredEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.RecordFoodSponsoredEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	accepted, err := h.foodSponsoredSvc.RecordEvent(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("merchant_id"), req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"accepted": accepted})
}
