package handler

import (
	"encoding/json"
	"net/http"

	"tembus/order-service/internal/service"
)

type ResiHandler struct {
	resiSvc service.ResiService
}

func NewResiHandler(resiSvc service.ResiService) *ResiHandler {
	return &ResiHandler{resiSvc: resiSvc}
}

func (h *ResiHandler) RenderResi(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	awb := r.PathValue("awb")
	if awb == "" {
		http.Error(w, "awb is required", http.StatusBadRequest)
		return
	}

	result, err := h.resiSvc.RenderResiByAWB(r.Context(), awb)
	if err != nil {
		// Just simple error response for now
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
