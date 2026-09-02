package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

type TowingClaimHandler struct {
	svc domain.TowingDamageClaimService
}

func NewTowingClaimHandler(svc domain.TowingDamageClaimService) *TowingClaimHandler {
	return &TowingClaimHandler{svc: svc}
}

// POST /api/v1/courier/towing/damage-claims
func (h *TowingClaimHandler) SubmitClaim(w http.ResponseWriter, r *http.Request) {
	operatorID := middleware.GetUserIDFromContext(r.Context())
	if operatorID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if role := middleware.GetRoleFromContext(r.Context()); role != "courier" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var req domain.SubmitTowingDamageClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeTowingClaimError(w, err)
		return
	}
	claim, err := h.svc.SubmitClaim(r.Context(), &req, operatorID)
	if err != nil {
		writeTowingClaimError(w, err)
		return
	}
	writeTowingClaimJSON(w, http.StatusCreated, claim)
}

// PATCH /api/v1/admin/towing/damage-claims/{id}/decision
func (h *TowingClaimHandler) DecideClaim(w http.ResponseWriter, r *http.Request) {
	if !isTowingClaimReviewer(middleware.GetRoleFromContext(r.Context())) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	reviewerID := middleware.GetUserIDFromContext(r.Context())
	var req domain.DecideTowingDamageClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeTowingClaimError(w, err)
		return
	}
	req.ClaimID = strings.TrimSpace(r.PathValue("id"))
	claim, err := h.svc.DecideClaim(r.Context(), &req, reviewerID)
	if err != nil {
		writeTowingClaimError(w, err)
		return
	}
	writeTowingClaimJSON(w, http.StatusOK, claim)
}

// POST /api/v1/admin/towing/damage-claims/{id}/reconcile
func (h *TowingClaimHandler) ReconcileCompensation(w http.ResponseWriter, r *http.Request) {
	if !isTowingClaimReviewer(middleware.GetRoleFromContext(r.Context())) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	reviewerID := middleware.GetUserIDFromContext(r.Context())
	var req domain.ReconcileTowingDamageCompensationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeTowingClaimError(w, err)
		return
	}
	req.ClaimID = strings.TrimSpace(r.PathValue("id"))
	claim, err := h.svc.ReconcileCompensation(r.Context(), &req, reviewerID)
	if err != nil {
		writeTowingClaimError(w, err)
		return
	}
	writeTowingClaimJSON(w, http.StatusOK, claim)
}

func isTowingClaimReviewer(role string) bool {
	switch role {
	case "admin", "super_admin", "ops_admin", "finance", "finance_admin":
		return true
	default:
		return false
	}
}

func writeTowingClaimJSON(w http.ResponseWriter, status int, claim *domain.TowingDamageClaim) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": claim})
}

func writeTowingClaimError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	code := "ERR_INVALID_TOWING_DAMAGE_CLAIM"
	if errors.Is(err, domain.ErrInvalidServiceReport) {
		code = "ERR_INVALID_SERVICE_REPORT"
	}
	http.Error(w, code+": "+err.Error(), status)
}
