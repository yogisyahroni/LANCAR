package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// ── FOOD-2026-007: Item unavailable + substitution — handler ────────

// ReportFoodItemUnavailable godoc
// @Summary Report item unavailable (Merchant)
// @Description Merchant laporkan item makanan tidak tersedia saat sedang mempersiapkan order.
// @Tags food
// @Accept json
// @Produce json
// @Security Bearer
// @Param order_id path string true "Order ID"
// @Param request body domain.ReportFoodItemUnavailableRequest true "Request"
// @Success 200 {object} map[string]bool
// @Router /api/v1/food/orders/{order_id}/item-unavailable [post]
func (h *OrderHandler) ReportFoodItemUnavailable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	merchantID := middleware.GetUserIDFromContext(r.Context())
	if merchantID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderID := r.PathValue("order_id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "order_id wajib dikirim", middleware.GetCorrelationID(r.Context()))
		return
	}
	req, ok := middleware.GetValidatedData(r.Context()).(*domain.ReportFoodItemUnavailableRequest)
	if !ok || req == nil {
		// Fallback: decode manual bila middleware belum set.
		req = &domain.ReportFoodItemUnavailableRequest{}
		if err := json.NewDecoder(r.Body).Decode(req); err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
			return
		}
	}
	if err := h.orderSvc.ReportFoodItemUnavailable(r.Context(), merchantID, orderID, *req); err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true, "item_unavailable_reported": true})
}

// ProposeFoodSubstitution godoc
// @Summary Propose substitution (Merchant)
// @Description Merchant usulkan item pengganti untuk item yang tidak tersedia.
// @Tags food
// @Accept json
// @Produce json
// @Security Bearer
// @Param order_id path string true "Order ID"
// @Param request body domain.ProposeFoodSubstitutionRequest true "Request"
// @Success 200 {object} domain.FoodSubstitutionProposal
// @Router /api/v1/food/orders/{order_id}/substitution [post]
func (h *OrderHandler) ProposeFoodSubstitution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	merchantID := middleware.GetUserIDFromContext(r.Context())
	if merchantID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderID := r.PathValue("order_id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "order_id wajib dikirim", middleware.GetCorrelationID(r.Context()))
		return
	}
	req, ok := middleware.GetValidatedData(r.Context()).(*domain.ProposeFoodSubstitutionRequest)
	if !ok || req == nil {
		req = &domain.ProposeFoodSubstitutionRequest{}
		if err := json.NewDecoder(r.Body).Decode(req); err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body", middleware.GetCorrelationID(r.Context()))
			return
		}
	}
	proposal, err := h.orderSvc.ProposeFoodSubstitution(r.Context(), merchantID, orderID, *req)
	if err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(proposal)
}

// GetPendingSubstitutionProposals godoc
// @Summary List pending substitution proposals (Customer)
// @Description Customer lihat proposal substitution yang perlu diputuskan.
// @Tags food
// @Produce json
// @Security Bearer
// @Param order_id path string true "Order ID"
// @Success 200 {array} domain.FoodSubstitutionProposal
// @Router /api/v1/food/orders/{order_id}/substitutions [get]
func (h *OrderHandler) GetPendingSubstitutionProposals(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderID := r.PathValue("order_id")
	if orderID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "order_id wajib dikirim", middleware.GetCorrelationID(r.Context()))
		return
	}
	proposals, err := h.orderSvc.GetPendingSubstitutionProposals(r.Context(), customerID, orderID)
	if err != nil {
		userSafeError(w, r, err, http.StatusForbidden)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"substitutions": proposals})
}

// DecideFoodSubstitution godoc
// @Summary Approve or reject substitution (Customer)
// @Description Customer setujui atau tolak usulan pengganti item.
// @Tags food
// @Accept json
// @Produce json
// @Security Bearer
// @Param proposal_id path string true "Proposal ID"
// @Param request body domain.SubstitutionDecisionRequest true "Request"
// @Success 200 {object} map[string]bool
// @Router /api/v1/food/substitutions/{proposal_id}/decision [post]
func (h *OrderHandler) DecideFoodSubstitution(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	customerID := middleware.GetUserIDFromContext(r.Context())
	if customerID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	proposalID := r.PathValue("proposal_id")
	if proposalID == "" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ID", "proposal_id wajib dikirim", middleware.GetCorrelationID(r.Context()))
		return
	}
	var req domain.SubstitutionDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "Invalid request body (decision: approved|rejected)", middleware.GetCorrelationID(r.Context()))
		return
	}
	if req.Decision != "approved" && req.Decision != "rejected" {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_BAD_REQUEST", "decision harus 'approved' atau 'rejected'", middleware.GetCorrelationID(r.Context()))
		return
	}
	if err := h.orderSvc.DecideFoodSubstitution(r.Context(), customerID, proposalID, req); err != nil {
		userSafeError(w, r, err, http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	approved := req.Decision == "approved"
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true, "substitution_approved": approved})
}

// ValidateReportFoodItemUnavailable — middleware validator untuk body.
// FOOD-2026-007: validasi request body item unavailable.
func ValidateReportFoodItemUnavailable(v *domain.ReportFoodItemUnavailableRequest) error {
	if v.MenuItemID == "" {
		return fmt.Errorf("menu_item_id wajib diisi")
	}
	if v.Quantity < 1 {
		return fmt.Errorf("quantity minimal 1")
	}
	if v.Reason == "" || len(v.Reason) > 200 {
		return fmt.Errorf("reason wajib diisi (maks 200 karakter)")
	}
	return nil
}

// ValidateProposeFoodSubstitution — middleware validator untuk body.
func ValidateProposeFoodSubstitution(v *domain.ProposeFoodSubstitutionRequest) error {
	if v.OriginalMenuItemID == "" {
		return fmt.Errorf("original_menu_item_id wajib diisi")
	}
	if v.ReplacementMenuItemID == "" {
		return fmt.Errorf("replacement_menu_item_id wajib diisi")
	}
	if v.OriginalMenuItemID == v.ReplacementMenuItemID {
		return fmt.Errorf("replacement tidak boleh sama dengan original")
	}
	if len(v.Reason) > 500 {
		return fmt.Errorf("reason maksimal 500 karakter")
	}
	return nil
}

// ensure strconv import is used (PathValue parsing helper).
var _ = strconv.Atoi
