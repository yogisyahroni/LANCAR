package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

func (h *OrderHandler) CreateFoodGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	if h.foodGroupSvc == nil {
		userSafeError(w, r, fmt.Errorf("food group service not wired"), http.StatusServiceUnavailable)
		return
	}
	userID := middleware.GetUserIDFromContext(r.Context())
	var req domain.CreateFoodGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	group, err := h.foodGroupSvc.CreateFoodGroup(r.Context(), userID, req)
	if err != nil {
		userSafeError(w, r, err, http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(group)
}

func (h *OrderHandler) GetFoodGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	groupID := r.PathValue("group_id")
	group, err := h.foodGroupSvc.GetFoodGroup(r.Context(), middleware.GetUserIDFromContext(r.Context()), groupID)
	if err != nil {
		userSafeError(w, r, err, http.StatusNotFound)
		return
	}
	_ = json.NewEncoder(w).Encode(group)
}

func (h *OrderHandler) JoinFoodGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	err := h.foodGroupSvc.JoinFoodGroup(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("group_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"joined": true})
}

func (h *OrderHandler) LeaveFoodGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	err := h.foodGroupSvc.LeaveFoodGroup(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("group_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"left": true})
}

func (h *OrderHandler) AddFoodGroupCartItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.AddFoodGroupCartItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
		return
	}
	item, err := h.foodGroupSvc.AddCartItem(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("group_id"), req)
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(item)
}

func (h *OrderHandler) RemoveFoodGroupCartItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	err := h.foodGroupSvc.RemoveCartItem(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("group_id"), r.PathValue("item_id"))
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]bool{"removed": true})
}

func (h *OrderHandler) CloseFoodGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}
	// The final total is supplied by the trusted quote/order flow in production;
	// this endpoint accepts it only as an internal server-calculated handoff,
	// never as an item price or per-member amount.
	var body struct {
		TotalIDR int64 `json:"total_idr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TotalIDR < 0 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "total_idr is required and cannot be negative", middleware.GetCorrelationID(r.Context()))
		return
	}
	group, err := h.foodGroupSvc.CloseFoodGroup(r.Context(), middleware.GetUserIDFromContext(r.Context()), r.PathValue("group_id"), body.TotalIDR)
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	_ = json.NewEncoder(w).Encode(group)
}
