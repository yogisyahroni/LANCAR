package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// TowingHandler owns towing-only report boundaries. The public route remains
// unchanged while towing proof/claim behavior can evolve independently from
// the tambal-ban handler.
type TowingHandler struct {
	reportSvc domain.ServiceReportService
}

func NewTowingHandler(reportSvc domain.ServiceReportService) *TowingHandler {
	return &TowingHandler{reportSvc: reportSvc}
}

// POST /api/v1/courier/service-report/towing
func (h *TowingHandler) CreateTowingReport(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserIDFromContext(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req domain.TowingReport
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid request body",
			middleware.GetCorrelationID(r.Context()))
		return
	}
	req.CourierID = userID

	if err := h.reportSvc.CreateTowingReport(r.Context(), &req); err != nil {
		if errors.Is(err, domain.ErrInvalidServiceReport) {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_SERVICE_REPORT", err.Error(),
				middleware.GetCorrelationID(r.Context()))
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", "Failed to create report",
			middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(req)
}
