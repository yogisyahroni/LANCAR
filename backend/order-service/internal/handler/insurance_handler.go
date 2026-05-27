package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
)

type InsuranceHandler struct {
	insuranceSvc domain.InsuranceService
}

func NewInsuranceHandler(insuranceSvc domain.InsuranceService) *InsuranceHandler {
	return &InsuranceHandler{insuranceSvc: insuranceSvc}
}

func (h *InsuranceHandler) EnrollBPJSTK(w http.ResponseWriter, r *http.Request) {
	// Assume user ID is available in header for this mock
	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	courierID, err := uuid.Parse(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	ins, err := h.insuranceSvc.EnrollBPJSTK(r.Context(), courierID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	statusCode := http.StatusOK
	message := "Successfully enrolled to BPJS Ketenagakerjaan"
	if ins.Status == domain.InsuranceStatusPendingProviderActivation {
		statusCode = http.StatusAccepted
		message = "BPJS enrollment recorded and pending provider activation"
	}

	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": message,
		"data":    ins,
	})
}
