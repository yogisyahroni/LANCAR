package handler

import (
	"net/http"

	"tembus/order-service/internal/middleware"
)

type SLAHandler struct {
	slaService interface{}
}

func NewSLAHandler(slaService interface{}) *SLAHandler {
	return &SLAHandler{slaService: slaService}
}

func (h *SLAHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")

	if date == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "date query parameter is required", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_SLA_DASHBOARD", "SLA dashboard is not wired yet.", middleware.GetCorrelationID(r.Context()))
}
