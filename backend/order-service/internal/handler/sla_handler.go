package handler

import (
	"net/http"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type SLAHandler struct {
	slaService domain.SLAService
}

func NewSLAHandler(slaService domain.SLAService) *SLAHandler {
	return &SLAHandler{slaService: slaService}
}

func (h *SLAHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	date := r.URL.Query().Get("date")
	if date == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Parameter 'date' wajib diisi (format: YYYY-MM-DD)", middleware.GetCorrelationID(r.Context()))
		return
	}

	zoneID := r.URL.Query().Get("zone_id")

	result, err := h.slaService.GetComplianceDashboard(r.Context(), zoneID, date)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_SLA_DASHBOARD", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, result)
}
