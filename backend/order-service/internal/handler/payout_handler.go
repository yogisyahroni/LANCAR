package handler

import (
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/middleware"
)

type PayoutHandler struct {
	payoutService interface{}
}

func NewPayoutHandler(payoutService interface{}) *PayoutHandler {
	return &PayoutHandler{payoutService: payoutService}
}

func (h *PayoutHandler) TriggerBatchPayout(w http.ResponseWriter, r *http.Request) {
	middleware.WriteError(w, http.StatusNotImplemented, "TODO_PAYOUT_BATCH", "Batch payout trigger will be connected once the payout worker endpoint is ready.", middleware.GetCorrelationID(r.Context()))
}

func (h *PayoutHandler) GetCourierEarnings(w http.ResponseWriter, r *http.Request) {
	courierIDStr := r.Header.Get("X-Courier-ID")
	if courierIDStr == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid Courier ID", middleware.GetCorrelationID(r.Context()))
		return
	}
	if _, err := uuid.Parse(courierIDStr); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid Courier ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_EARNINGS", "Earnings summary endpoint is not wired yet.", middleware.GetCorrelationID(r.Context()))
}
