package handler

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type PayoutHandler struct {
	payoutService domain.PayoutService
}

func NewPayoutHandler(payoutService domain.PayoutService) *PayoutHandler {
	return &PayoutHandler{payoutService: payoutService}
}

func (h *PayoutHandler) TriggerBatchPayout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.payoutService.TriggerBatchPayout(r.Context()); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_PAYOUT", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]string{"status": "batch_payout_triggered"})
}

func (h *PayoutHandler) GetCourierEarnings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Ambil courierID dari header yang di-set oleh AuthMiddleware
	courierIDStr := r.Header.Get("X-Courier-ID")
	if courierIDStr == "" {
		// Coba dari query param jika tidak ada header
		courierIDStr = r.URL.Query().Get("courier_id")
	}
	if courierIDStr == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "courier_id wajib diisi", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Strip /couriers/ prefix jika ada di path
	courierIDStr = strings.TrimSpace(courierIDStr)
	courierID, err := uuid.Parse(courierIDStr)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "courier_id tidak valid", middleware.GetCorrelationID(r.Context()))
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "this_month"
	}

	summary, err := h.payoutService.GetCourierEarnings(r.Context(), courierID, period)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_EARNINGS", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, summary)
}
