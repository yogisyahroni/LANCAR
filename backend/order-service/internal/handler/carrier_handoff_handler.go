package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type CarrierHandoffHandler struct {
	svc            domain.CarrierHandoffService
	internalAPIKey string
}

func NewCarrierHandoffHandler(svc domain.CarrierHandoffService) *CarrierHandoffHandler {
	return &CarrierHandoffHandler{svc: svc, internalAPIKey: os.Getenv("INTERNAL_API_KEY")}
}

// RecordHandoff is called by an authenticated courier/warehouse actor. The
// service validates the AWB attempt and requires proof for lancar_pickup.
func (h *CarrierHandoffHandler) RecordHandoff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	actorID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if actorID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if role != "courier" && role != "warehouse" && role != "admin" && role != "super_admin" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var req domain.RecordCarrierHandoffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	req.ActorID, req.ActorType = actorID, role
	handoff, err := h.svc.RecordHandoff(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": handoff})
}

// ApplyCarrierAcceptance is restricted to integration-gateway. It records the
// provider acknowledgement; lifecycle consumers remain responsible for status transitions.
func (h *CarrierHandoffHandler) ApplyCarrierAcceptance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.internalAPIKey != "" && r.Header.Get("X-Internal-Api-Key") != h.internalAPIKey {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var event domain.CarrierAcceptanceEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if err := h.svc.ApplyCarrierAcceptance(r.Context(), event); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "provider": strings.TrimSpace(event.Provider), "awb_number": strings.TrimSpace(event.AWBNumber)})
}
