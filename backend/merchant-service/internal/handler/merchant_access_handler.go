package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"tembus/merchant-service/internal/domain"
)

type MerchantAccessHandler struct {
	*MerchantHandler
	accessSvc domain.MerchantAccessService
}

func NewMerchantAccessHandler(mh *MerchantHandler, svc domain.MerchantAccessService) *MerchantAccessHandler {
	return &MerchantAccessHandler{MerchantHandler: mh, accessSvc: svc}
}

func (h *MerchantAccessHandler) CreateBranch(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	merchantID := r.PathValue("id")
	var req domain.CreateMerchantBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	branch, err := h.accessSvc.CreateBranch(r.Context(), userID, merchantID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, map[string]any{"success": true, "data": branch})
}

func (h *MerchantAccessHandler) ListBranches(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	branches, err := h.accessSvc.ListBranches(r.Context(), userID, r.PathValue("id"))
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "data": branches})
}

func (h *MerchantAccessHandler) UpdateBranch(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.UpdateMerchantBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	branch, err := h.accessSvc.UpdateBranch(r.Context(), userID, r.PathValue("id"), r.PathValue("branchId"), req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "data": branch})
}

func (h *MerchantAccessHandler) AssignStaffBranches(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.MerchantStaffBranchAssignment
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if err := h.accessSvc.AssignStaffBranches(r.Context(), userID, r.PathValue("id"), r.PathValue("staffId"), req); err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "branch_ids": req.BranchIDs})
}

func (h *MerchantAccessHandler) ListStaffBranches(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	branchIDs, err := h.accessSvc.ListStaffBranches(r.Context(), userID, r.PathValue("id"), r.PathValue("staffId"))
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true, "branch_ids": branchIDs})
}

func (h *MerchantAccessHandler) CreateDeviceSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.CreateMerchantDeviceSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	session, err := h.accessSvc.CreateDeviceSession(r.Context(), userID, r.PathValue("id"), req)
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, map[string]any{
		"success": true, "data": session,
		"warning": "session_token hanya ditampilkan sekali dan harus disimpan aman di device",
	})
}

func (h *MerchantAccessHandler) RevokeDeviceSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	if err := h.accessSvc.RevokeDeviceSession(r.Context(), userID, r.PathValue("id"), r.PathValue("sessionId")); err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

func requireStepUp(r *http.Request) bool {
	return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-TOTP-Verified")), "true")
}

func (h *MerchantAccessHandler) CreateSecurityApproval(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	if !requireStepUp(r) {
		h.respondError(w, http.StatusUnauthorized, "step-up authentication (TOTP) wajib")
		return
	}
	var req domain.CreateSecurityApprovalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	approval, err := h.accessSvc.CreateSecurityApproval(r.Context(), userID, r.PathValue("id"), req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusCreated, map[string]any{"success": true, "data": approval})
}

func (h *MerchantAccessHandler) ApproveSecurityApproval(w http.ResponseWriter, r *http.Request) {
	approverID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	if !requireStepUp(r) {
		h.respondError(w, http.StatusUnauthorized, "step-up authentication (TOTP) wajib")
		return
	}
	var req domain.ApproveSecurityApprovalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if err := h.accessSvc.ApproveSecurityApproval(r.Context(), approverID, r.Header.Get("X-User-Role"), r.PathValue("id"), r.PathValue("approvalId"), req); err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]any{"success": true})
}
