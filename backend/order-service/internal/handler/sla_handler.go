package handler

import (
	"encoding/json"
	"net/http"

	"lancar/order-service/internal/domain"
)

type SLAHandler struct {
	slaService domain.SLAService
}

func NewSLAHandler(slaService domain.SLAService) *SLAHandler {
	return &SLAHandler{
		slaService: slaService,
	}
}

func (h *SLAHandler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	zoneID := r.URL.Query().Get("zone_id")
	date := r.URL.Query().Get("date") // Format: YYYY-MM-DD

	if date == "" {
		http.Error(w, "date query parameter is required", http.StatusBadRequest)
		return
	}

	data, err := h.slaService.GetComplianceDashboard(r.Context(), zoneID, date)
	if err != nil {
		http.Error(w, "Failed to get SLA dashboard: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    data,
	})
}
