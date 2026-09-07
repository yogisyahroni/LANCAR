package handler

import (
	"encoding/json"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

func (h *OrderHandler) CreateFoodBundle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.CreateFoodMultiStoreBundleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	bundle, err := h.foodBundleSvc.CreateBundle(r.Context(), middleware.GetUserIDFromContext(r.Context()), req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(bundle)
}

func (h *OrderHandler) GetFoodBundle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	bundle, err := h.foodBundleSvc.GetBundle(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("bundle_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusNotFound)
		return
	}
	_ = json.NewEncoder(w).Encode(bundle)
}

func (h *OrderHandler) AttachFoodBundleOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	err := h.foodBundleSvc.AttachOrder(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("bundle_id"), r.PathValue("order_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"attached": true})
}

func (h *OrderHandler) FinalizeFoodBundle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	bundle, err := h.foodBundleSvc.FinalizeBundle(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("bundle_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(bundle)
}
