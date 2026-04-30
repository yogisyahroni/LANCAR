package handler

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"lancar/order-service/internal/domain"
)

type PayoutHandler struct {
	payoutService domain.PayoutService
}

func NewPayoutHandler(payoutService domain.PayoutService) *PayoutHandler {
	return &PayoutHandler{
		payoutService: payoutService,
	}
}

// TriggerBatchPayout handles manual trigger of payouts
// POST /admin/payouts/trigger
func (h *PayoutHandler) TriggerBatchPayout(w http.ResponseWriter, r *http.Request) {
	err := h.payoutService.TriggerBatchPayout(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Batch payout triggered successfully",
	})
}

// GetCourierEarnings retrieves earnings summary for a courier
// GET /couriers/me/earnings
func (h *PayoutHandler) GetCourierEarnings(w http.ResponseWriter, r *http.Request) {
	// For MVP, we extract courier_id from header instead of real auth context
	courierIDStr := r.Header.Get("X-Courier-ID")
	courierID, err := uuid.Parse(courierIDStr)
	if err != nil {
		http.Error(w, "Invalid Courier ID", http.StatusBadRequest)
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "this_month"
	}

	summary, err := h.payoutService.GetCourierEarnings(r.Context(), courierID, period)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
