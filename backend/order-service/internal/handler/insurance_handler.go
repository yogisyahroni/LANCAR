package handler

import (
	"net/http"

	"github.com/google/uuid"
	"tembus/order-service/internal/middleware"
)

type InsuranceHandler struct {
	insuranceSvc interface{}
}

func NewInsuranceHandler(insuranceSvc interface{}) *InsuranceHandler {
	return &InsuranceHandler{insuranceSvc: insuranceSvc}
}

func (h *InsuranceHandler) EnrollBPJSTK(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userIDStr := r.Header.Get("X-User-ID")
	if userIDStr == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}

	if _, err := uuid.Parse(userIDStr); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid user ID", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Insurance provider (BPJSTK API adapter) belum terhubung.
	// Fitur ini akan aktif setelah integrasi dengan provider selesai.
	middleware.WriteError(w, http.StatusServiceUnavailable, "FEATURE_COMING_SOON",
		"Pendaftaran BPJSTK sedang dalam proses integrasi dengan penyedia layanan. Silakan coba lagi dalam waktu dekat.",
		middleware.GetCorrelationID(r.Context()))
}
