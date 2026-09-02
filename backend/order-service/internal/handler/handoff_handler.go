package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
	"time"
)

type issueHandoffTokenRequest struct {
	OrderID    string `json:"order_id"`
	Stage      string `json:"stage"`
	TTLSeconds int    `json:"ttl_seconds,omitempty"`
}

type consumeHandoffTokenRequest struct {
	OrderID string `json:"order_id"`
	Stage   string `json:"stage"`
	Token   string `json:"token"`
}

func (h *OrderHandler) IssueHandoffToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.handoffSvc == nil {
		writeHandoffError(w, r, http.StatusServiceUnavailable, "HANDOFF_UNAVAILABLE", "Layanan verifikasi serah terima belum tersedia")
		return
	}
	actorID := middleware.GetUserIDFromContext(r.Context())
	role := middleware.GetRoleFromContext(r.Context())
	if actorID == "" {
		writeHandoffError(w, r, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid")
		return
	}
	if role != "courier" && role != "admin" && role != "super_admin" {
		writeHandoffError(w, r, http.StatusForbidden, "ERR_FORBIDDEN", "Hanya petugas yang dapat menerbitkan token serah terima")
		return
	}
	var req issueHandoffTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeHandoffError(w, r, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid")
		return
	}
	order, err := h.orderSvc.GetOrder(r.Context(), req.OrderID)
	if err != nil || order == nil {
		writeHandoffError(w, r, http.StatusNotFound, "ERR_NOT_FOUND", "Order tidak ditemukan")
		return
	}
	if role == "courier" && (order.CourierID == nil || *order.CourierID != actorID) {
		writeHandoffError(w, r, http.StatusForbidden, "ERR_FORBIDDEN", "Token hanya dapat diterbitkan oleh kurir yang ditugaskan")
		return
	}
	ttl := time.Duration(req.TTLSeconds) * time.Second
	code, record, err := h.handoffSvc.Issue(r.Context(), req.OrderID, actorID, domain.HandoffStage(req.Stage), ttl)
	if err != nil {
		writeHandoffError(w, r, http.StatusBadRequest, "HANDOFF_TOKEN_INVALID", err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"data": map[string]any{
			"token":      code,
			"order_id":   record.OrderID,
			"stage":      record.Stage,
			"expires_at": record.ExpiresAt,
		},
	})
}

func (h *OrderHandler) ConsumeHandoffToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.handoffSvc == nil {
		writeHandoffError(w, r, http.StatusServiceUnavailable, "HANDOFF_UNAVAILABLE", "Layanan verifikasi serah terima belum tersedia")
		return
	}
	actorID := middleware.GetUserIDFromContext(r.Context())
	if actorID == "" {
		writeHandoffError(w, r, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Sesi tidak valid")
		return
	}
	var req consumeHandoffTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeHandoffError(w, r, http.StatusBadRequest, "ERR_BAD_REQUEST", "Format request tidak valid")
		return
	}
	if err := h.handoffSvc.Consume(r.Context(), req.Token, req.OrderID, actorID, domain.HandoffStage(req.Stage)); err != nil {
		status, code := http.StatusConflict, "HANDOFF_TOKEN_INVALID"
		switch {
		case errors.Is(err, domain.ErrHandoffTokenExpired):
			code = "HANDOFF_TOKEN_EXPIRED"
		case errors.Is(err, domain.ErrHandoffTokenConsumed):
			code = "HANDOFF_TOKEN_CONSUMED"
		case errors.Is(err, domain.ErrHandoffTokenAttemptsLimit):
			code = "HANDOFF_TOKEN_ATTEMPTS_EXCEEDED"
		case errors.Is(err, domain.ErrHandoffActorMismatch):
			status, code = http.StatusForbidden, "HANDOFF_ACTOR_MISMATCH"
		case errors.Is(err, domain.ErrHandoffOrderMismatch):
			status, code = http.StatusConflict, "HANDOFF_ORDER_MISMATCH"
		case errors.Is(err, domain.ErrHandoffStageMismatch):
			status, code = http.StatusConflict, "HANDOFF_STAGE_MISMATCH"
		}
		writeHandoffError(w, r, status, code, "Token serah terima ditolak")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]string{"order_id": req.OrderID, "stage": req.Stage, "status": "consumed"}})
}

func writeHandoffError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	middleware.WriteError(w, status, code, message, middleware.GetCorrelationID(r.Context()))
}
