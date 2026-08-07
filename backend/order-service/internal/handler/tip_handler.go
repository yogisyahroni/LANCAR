package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"tembus/order-service/internal/domain"
	"tembus/order-service/internal/middleware"
)

// TipHandler — FB-077: tip customer → kurir (semua service).
type TipHandler struct {
	tipSvc domain.TipService
}

func NewTipHandler(svc domain.TipService) *TipHandler {
	return &TipHandler{tipSvc: svc}
}

// CreateTip — POST /api/v1/orders/{id}/tips (customer).
func (h *TipHandler) CreateTip(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	customerUUID, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_USER", "Invalid user id", middleware.GetCorrelationID(r.Context()))
		return
	}

	// Path: /api/v1/orders/{id}/tips
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_PATH", "Invalid path", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderUUID, err := uuid.Parse(parts[3])
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ORDER", "Invalid order id", middleware.GetCorrelationID(r.Context()))
		return
	}

	var req struct {
		AmountIDR int64 `json:"amount_idr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_BODY", "Invalid JSON payload", middleware.GetCorrelationID(r.Context()))
		return
	}

	tip, err := h.tipSvc.CreateTip(r.Context(), orderUUID, customerUUID, req.AmountIDR)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_TIP", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusCreated, map[string]any{
		"tip":         tip,
		"message":     "Tip berhasil diberikan",
		"amount_idr":  tip.AmountIDR,
	})
}

// GetTipByOrder — GET /api/v1/orders/{id}/tips (customer/courier: cek status tip).
func (h *TipHandler) GetTipByOrder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_PATH", "Invalid path", middleware.GetCorrelationID(r.Context()))
		return
	}
	orderUUID, err := uuid.Parse(parts[3])
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_ORDER", "Invalid order id", middleware.GetCorrelationID(r.Context()))
		return
	}

	tip, err := h.tipSvc.GetTipByOrder(r.Context(), orderUUID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	if tip == nil {
		middleware.WriteSuccess(w, http.StatusOK, map[string]any{"tip": nil, "tipped": false})
		return
	}
	middleware.WriteSuccess(w, http.StatusOK, map[string]any{"tip": tip, "tipped": true})
}

// ListCourierTips — GET /api/v1/courier/tips (courier: riwayat tip diterima).
func (h *TipHandler) ListCourierTips(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	courierUUID, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_USER", "Invalid user id", middleware.GetCorrelationID(r.Context()))
		return
	}

	tips, err := h.tipSvc.ListTipsByCourier(r.Context(), courierUUID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}
	if tips == nil {
		tips = []domain.DriverTip{}
	}
	middleware.WriteSuccess(w, http.StatusOK, map[string]any{"tips": tips})
}

// GetCourierTipSummary — GET /api/v1/courier/tips/summary (courier).
func (h *TipHandler) GetCourierTipSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		middleware.WriteError(w, http.StatusMethodNotAllowed, "ERR_METHOD_NOT_ALLOWED", "Method not allowed", middleware.GetCorrelationID(r.Context()))
		return
	}

	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		middleware.WriteError(w, http.StatusUnauthorized, "ERR_UNAUTHORIZED", "Unauthorized", middleware.GetCorrelationID(r.Context()))
		return
	}
	courierUUID, err := uuid.Parse(userID)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "ERR_INVALID_USER", "Invalid user id", middleware.GetCorrelationID(r.Context()))
		return
	}

	summary, err := h.tipSvc.GetTipSummary(r.Context(), courierUUID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "ERR_INTERNAL", err.Error(), middleware.GetCorrelationID(r.Context()))
		return
	}

	middleware.WriteSuccess(w, http.StatusOK, map[string]any{"summary": summary})
}
