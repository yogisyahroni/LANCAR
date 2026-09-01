package handler

import (
	"encoding/json"
	"net/http"

	"tembus/merchant-service/internal/domain"
)

// StaffHandler — endpoint staff management (corporate only).
// Identity dari X-User-ID (API Gateway setelah JWT verify).
// Embed *MerchantHandler untuk reuse parseUserID/respondError/respondJSON.
type StaffHandler struct {
	*MerchantHandler
	staffSvc domain.StaffService
}

func NewStaffHandler(mh *MerchantHandler, ss domain.StaffService) *StaffHandler {
	return &StaffHandler{MerchantHandler: mh, staffSvc: ss}
}

func (h *StaffHandler) Invite(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		h.respondError(w, http.StatusBadRequest, "merchant_id wajib")
		return
	}
	var req domain.InviteStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	staff, err := h.staffSvc.Invite(r.Context(), userID, merchantID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Jangan kirim invite_token ke response (staff perlu token via notif).
	h.respondJSON(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"staff_id": staff.ID,
		"role":     staff.Role,
		"status":   staff.Status,
		"message":  "Undangan dibuat. Token dikirim ke " + maskContact(req.Email, req.Phone) + ".",
	})
}

func (h *StaffHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	merchantID := r.PathValue("id")
	if merchantID == "" {
		h.respondError(w, http.StatusBadRequest, "merchant_id wajib")
		return
	}
	result, err := h.staffSvc.ListStaff(r.Context(), userID, merchantID)
	if err != nil {
		h.respondError(w, http.StatusForbidden, err.Error())
		return
	}
	out := make([]domain.StaffPublicView, 0, len(result.Staff))
	for _, s := range result.Staff {
		out = append(out, s.ToPublic())
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{"success": true, "data": out, "can_manage": result.CanManage})
}

func (h *StaffHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	var req domain.AcceptStaffInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	if req.InviteToken == "" {
		h.respondError(w, http.StatusBadRequest, "invite_token wajib")
		return
	}
	staff, err := h.staffSvc.AcceptInvite(r.Context(), userID, req.InviteToken)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"merchant_id": staff.MerchantID,
		"role":        staff.Role,
		"status":      staff.Status,
		"message":     "Berhasil bergabung sebagai staff toko.",
	})
}

func (h *StaffHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.parseUserID(w, r)
	if !ok {
		return
	}
	merchantID := r.PathValue("id")
	staffID := r.PathValue("staffId")
	if merchantID == "" || staffID == "" {
		h.respondError(w, http.StatusBadRequest, "merchant_id dan staff_id wajib")
		return
	}
	var req domain.UpdateStaffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	staff, err := h.staffSvc.UpdateStaff(r.Context(), userID, merchantID, staffID, req)
	if err != nil {
		h.respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    staff.ToPublic(),
	})
}

func maskContact(email, phone string) string {
	if email != "" {
		return "email " + email
	}
	if phone != "" {
		return "nomor " + phone
	}
	return "kontak"
}
