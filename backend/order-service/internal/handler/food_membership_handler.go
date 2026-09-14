package handler

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"tembus/order-service/internal/middleware"
)

func internalMembershipKeyAllowed(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("INTERNAL_API_KEY"))
	provided := strings.TrimSpace(r.Header.Get("X-Internal-Api-Key"))
	return expected != "" && len(expected) == len(provided) && subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) == 1
}

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
	key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	if key == "" || len(key) > 180 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_IDEMPOTENCY_REQUIRED", "X-Idempotency-Key is required", middleware.GetCorrelationID(r.Context()))
		return
	}
	entitlement, err := h.foodMembershipSvc.Subscribe(r.Context(), middleware.GetUserIDFromContext(r.Context()), body.PlanID, key)
	if err != nil {
		userSafeError(w, r, fmt.Errorf("subscribe membership: %w", err), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(entitlement)
}

// ApplyFoodMembershipPaymentEvent is an internal payment-service callback.
// It never accepts browser/customer auth and never activates an entitlement
// without a provider-derived payment state.
func (h *OrderHandler) ApplyFoodMembershipPaymentEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if !internalMembershipKeyAllowed(r) {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_INTERNAL_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	var body struct {
		PaymentState      string `json:"payment_state"`
		PaymentIntentID   string `json:"payment_intent_id"`
		ProviderReference string `json:"provider_reference"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	key := strings.TrimSpace(r.Header.Get("X-Idempotency-Key"))
	if key == "" || len(key) > 180 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_IDEMPOTENCY_REQUIRED", "X-Idempotency-Key is required", middleware.GetCorrelationID(r.Context()))
		return
	}
	entitlementID := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/api/v1/internal/food/membership/"))
	if strings.Contains(entitlementID, "/") {
		entitlementID = strings.SplitN(entitlementID, "/", 2)[0]
	}
	entitlement, err := h.foodMembershipSvc.ApplyPaymentEvent(r.Context(), entitlementID, body.PaymentState, strings.TrimSpace(body.PaymentIntentID), strings.TrimSpace(body.ProviderReference), key)
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": entitlement})
}
