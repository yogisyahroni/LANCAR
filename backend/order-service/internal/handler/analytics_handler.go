package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"tembus/order-service/internal/middleware"
	"tembus/order-service/internal/service"
)

type AnalyticsHandler struct {
	svc service.AnalyticsService
}

func NewAnalyticsHandler(svc service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc}
}

func (h *AnalyticsHandler) GetDashboardMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	zoneID := r.URL.Query().Get("zone_id")
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	now := time.Now()
	start := now.AddDate(0, 0, -30) // default 30 hari terakhir
	end := now

	if startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			start = t
		}
	}
	if endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t
		}
	}

	metrics, err := h.svc.GetDashboardMetrics(r.Context(), start, end, zoneID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_ANALYTICS", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, metrics)
}

func (h *AnalyticsHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	format := r.URL.Query().Get("format")
	if format != "" && format != "csv" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_UNSUPPORTED_FORMAT", "Hanya format CSV yang didukung saat ini.", middleware.GetCorrelationID(r.Context()))
		return
	}

	reportType := r.URL.Query().Get("type")
	if reportType == "" {
		reportType = "revenue"
	}

	zoneID := r.URL.Query().Get("zone_id")
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	now := time.Now()
	start := now.AddDate(0, 0, -30)
	end := now

	if startStr != "" {
		if t, err := time.Parse("2006-01-02", startStr); err == nil {
			start = t
		}
	}
	if endStr != "" {
		if t, err := time.Parse("2006-01-02", endStr); err == nil {
			end = t
		}
	}

	csvBytes, err := h.svc.GenerateCSVReport(r.Context(), start, end, zoneID, reportType)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_REPORT", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\"report.csv\"")
	w.WriteHeader(http.StatusOK)
	w.Write(csvBytes)
}

func (h *AnalyticsHandler) RefreshData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	if err := h.svc.RefreshData(r.Context()); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_REFRESH", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, json.RawMessage(`{"status":"refreshed"}`))
}
