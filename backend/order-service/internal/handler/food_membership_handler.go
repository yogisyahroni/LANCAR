package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"tembus/order-service/internal/middleware"
)

func (h *OrderHandler) ListFoodMembershipPlans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	plans, err := h.foodMembershipSvc.ListPlans(r.Context())
	if err != nil {
		userSafeError(w, r, err, http.StatusServiceUnavailable)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"plans": plans})
}

func (h *OrderHandler) GetFoodMembership(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	entitlement, err := h.foodMembershipSvc.GetEntitlement(r.Context(), middleware.GetUserIDFromContext(r.Context()))
	if err != nil {
		userSafeError(w, r, err, http.StatusInternalServerError)
		return
	}
	if entitlement == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_ = json.NewEncoder(w).Encode(entitlement)
}

func (h *OrderHandler) SubscribeFoodMembership(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var body struct {
		PlanID string `json:"plan_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	key := r.Header.Get("X-Idempotency-Key")
	entitlement, err := h.foodMembershipSvc.Subscribe(r.Context(), middleware.GetUserIDFromContext(r.Context()), body.PlanID, key)
	if err != nil {
		userSafeError(w, r, fmt.Errorf("subscribe membership: %w", err), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(entitlement)
}
