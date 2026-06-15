package handler

import (
	"net/http"

	"tembus/order-service/internal/middleware"
)

type AnalyticsHandler struct {
	service interface{}
}

func NewAnalyticsHandler(svc interface{}) *AnalyticsHandler {
	return &AnalyticsHandler{service: svc}
}

func (h *AnalyticsHandler) GetDashboardMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_ANALYTICS", "Analytics metrics will be available once the analytics data pipeline is wired.", middleware.GetCorrelationID(r.Context()))
}

func (h *AnalyticsHandler) GetReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	format := r.URL.Query().Get("format")
	if format != "" && format != "csv" {
		middleware.WriteError(w, http.StatusNotImplemented, "TODO_REPORT_FORMAT", "Only CSV reports are implemented; PDF support is not implemented yet.", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_REPORT", "Report generation is not wired to the analytics store yet.", middleware.GetCorrelationID(r.Context()))
}

func (h *AnalyticsHandler) RefreshData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteError(w, http.StatusNotImplemented, "TODO_ANALYTICS_REFRESH", "Analytics refresh is not wired to the analytics data pipeline yet.", middleware.GetCorrelationID(r.Context()))
}
