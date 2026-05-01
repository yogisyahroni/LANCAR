package handler

import (
	"encoding/json"
	"lancar/order-service/internal/service"
	"net/http"
	"time"
)

type AnalyticsHandler struct {
	service service.AnalyticsService
}

func NewAnalyticsHandler(service service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{service: service}
}

func (h *AnalyticsHandler) GetDashboardMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")
	zoneID := r.URL.Query().Get("zone_id")

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		start = time.Now().AddDate(0, 0, -30) // Default last 30 days
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		end = time.Now()
	}

	metrics, err := h.service.GetDashboardMetrics(r.Context(), start, end, zoneID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (h *AnalyticsHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	reportType := r.URL.Query().Get("type") // e.g., "revenue", "sla"
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")
	zoneID := r.URL.Query().Get("zone_id")
	format := r.URL.Query().Get("format") // "csv" or "pdf"

	start, _ := time.Parse("2006-01-02", startStr)
	end, _ := time.Parse("2006-01-02", endStr)
	if end.IsZero() {
		end = time.Now()
	}

	if format == "csv" || format == "" {
		data, err := h.service.GenerateCSVReport(r.Context(), start, end, zoneID, reportType)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=report.csv")
		w.Write(data)
		return
	}

	// PDF not implemented yet
	http.Error(w, "PDF format not yet implemented", http.StatusNotImplemented)
}

func (h *AnalyticsHandler) RefreshData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := h.service.RefreshData(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
